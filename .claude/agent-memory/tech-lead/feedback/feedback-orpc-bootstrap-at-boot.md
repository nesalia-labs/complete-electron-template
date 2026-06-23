---
name: feedback-orpc-bootstrap-at-boot
description: oRPC client must be initialized at app boot (main.tsx), not inside a route component. Gotcha hit during F2 PR 1-5 rollout 2026-06-23.
metadata:
  type: feedback
---

# oRPC client initialization — must happen at boot

**Rule:** Always call `initORPC()` in `apps/web/src/main.tsx`, awaited BEFORE `createRoot().render()`. Never inside a route component's `useEffect` or `beforeLoad`.

**Why:** Renderer hooks (`useSettings`, `useUpdateSetting`, `useRecentProjects`, future ones) call `getORPCClient()` synchronously during render. `getORPCClient()` throws "ORPC client not initialized" if `initORPC()` hasn't resolved yet.

The first attempt in this codebase put `initORPC()` inside `_app.index.tsx`'s `useEffect`. That worked accidentally — only when the user navigated `/` (home, where the call lived) → `/settings`. It broke as soon as the sidebar nav let users land directly on `/settings/general`, `/settings/appearance`, `/settings/projects`. Every hook in those routes threw on first render, mutations got ORPC errors caught by sonner, the toast appeared. Symptom: "Failed to save settings. Please try again." on every change, even though `useSettings` appeared to load (it doesn't actually — the query goes to `isError: true, data: undefined` state silently).

**How to apply:**
- New feature work that uses oRPC must verify the client is initialized at boot. Add to the PR checklist.
- If a hook uses `getORPCClient()`, it can only be called inside a TanStack Query (`queryFn`, `mutationFn`) or another async boundary — never in component body synchronously unless initORPC has resolved.
- The pattern for any async-before-render bootstrap:
  ```ts
  async function bootstrap(): Promise<void> {
    try { await initORPC() } catch (err) { console.error('[bootstrap] failed:', err) }
    createRoot(root).render(<App />)
  }
  void bootstrap()
  ```
  Blank page for ~10-50ms during handshake is acceptable UX. Catching the error and rendering anyway lets the user see the UI shell with empty/error states rather than a permanent blank screen if the main process IPC is broken.

**Diagnostic pattern for "ORPC client not initialized":**
1. Open DevTools console in the Electron window.
2. Look for `[useUpdateSetting] failed: Error: ORPC client not initialized` (or similar).
3. Confirm `initORPC()` is awaited in `main.tsx` before `createRoot().render()`.

**Related:** [[reference/orpc-bridge]], [[project-f2-pr1-foundation-state]] (the original mistake)
