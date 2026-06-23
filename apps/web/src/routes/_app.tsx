import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  SidebarInset,
  SidebarProvider,
} from '@electron-template/ui/components/sidebar'
import { AppSidebar } from '@/components/sidebars/app-sidebar'
import { AppHeader } from '@/components/headers/app-header'
import { AppTitleBar } from '@/components/headers/app-title-bar'
import { useSettings } from '@/hooks/useSettings'
import { applyTheme, setStoredTheme, type Theme } from '@/lib/theme-init'

export const Route = createFileRoute('/_app')({
  component: AppShell,
})

function AppShell() {
  const { data: settings } = useSettings()
  const theme = (settings?.theme as Theme | undefined) ?? 'system'

  // Apply theme + mirror to localStorage on every change.
  // The localStorage mirror is the zero-flash path: the inline script in
  // index.html reads it BEFORE React mounts. See apps/web/src/lib/theme-init.ts.
  useEffect(() => {
    applyTheme(theme)
    setStoredTheme(theme)
  }, [theme])

  // Follow OS theme when the user's preference is 'system'.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return (
    <>
      <AppTitleBar />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
