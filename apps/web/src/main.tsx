import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { Toaster } from 'sonner'
import { getRouter } from './router'
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

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={getRouter()} />
        <Toaster />
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>
)
