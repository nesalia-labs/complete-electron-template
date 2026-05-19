import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { I18nextProvider } from 'react-i18next'
import { getRouter } from './router'
import i18n from './i18n'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={getRouter()} />
    </I18nextProvider>
  </StrictMode>
)