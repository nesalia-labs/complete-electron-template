import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { Toaster } from 'sonner'
import { getRouter } from './router'
import { initORPC } from './lib/orpc'
import i18n from './i18n'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Settings are the source of truth — invalidate on mutation, not on
      // refetch. Other queries can opt in to a shorter staleTime.
      staleTime: 30_000,
      retry: 1
    }
  }
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

/**
 * Bootstrap: connect to the main process via MessagePort BEFORE rendering.
 *
 * Without this, every `getORPCClient()` call inside hooks (useSettings,
 * useUpdateSetting, useRecentProjects) throws "ORPC client not initialized"
 * on the first render. The first attempt at this in the codebase was to
 * call initORPC() inside _app.index.tsx's useEffect — but that route
 * doesn't mount until AFTER _app.tsx renders (and tries useSettings).
 *
 * Blocking the initial render on initORPC() is the cleanest fix:
 * the page is blank for ~10-50ms while the port handshakes, then renders
 * with the client ready. No race, no error state to handle.
 */
async function bootstrap(): Promise<void> {
  try {
    await initORPC()
  } catch (err) {
    // Bootstrap error: log and continue. Hooks will show error states;
    // the user can still see the UI shell.
    // eslint-disable-next-line no-console
    console.error('[bootstrap] initORPC failed:', err)
  }
  // The throw above guarantees `root` is non-null at runtime; the `!` is
  // needed because TS 6's flow analysis doesn't narrow closure captures.
  createRoot(root!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={getRouter()} />
          <Toaster />
        </QueryClientProvider>
      </I18nextProvider>
    </StrictMode>
  )
}

void bootstrap()
