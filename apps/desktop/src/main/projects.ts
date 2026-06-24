// TODO(PR5): implement real open/close logic. PR 4 wires the lifecycle hooks
// (close-on-quit) but the open/close path is a no-op stub for now.

/**
 * Open a project by ID. Real implementation (F5) will:
 *   1. Look up the project in the recent_projects / projects tables.
 *   2. Validate the project path exists on disk.
 *   3. Touch the recent_projects row (bump opened_at, refresh name).
 *   4. Push the project into the renderer's UI state.
 *
 * For now we keep the function no-op; F5 will add the projectId param.
 */
export function openProject(): void {
  // No-op until F5.
}

/**
 * Close the currently open project. Called from `before-quit` so the next
 * launch starts clean.
 */
export function closeProject(): void {
  // No-op until PR 5.
}