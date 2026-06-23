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
import i18n from '@/i18n'

export const Route = createFileRoute('/_app')({
  component: AppShell,
})

function AppShell() {
  const { data: settings } = useSettings()
  const theme = (settings?.theme as Theme | undefined) ?? 'system'
  const language = (settings?.language as string | undefined) ?? null

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

  // Sync the i18n bundle with the persisted language setting.
  //
  // Why this is in the layout, not in useUpdateSetting's onSuccess:
  // the layout is the single source of truth that reads settings and
  // applies side effects. Decoupling the i18n import from the mutation
  // hook means future settings (e.g. timezone, locale) follow the same
  // pattern without touching the hook.
  //
  // i18next's own LanguageDetector caches the previous language to
  // localStorage; the effect below overwrites that cache with the
  // electron-store value (the source of truth).
  useEffect(() => {
    if (!language || i18n.language === language) return
    void i18n.changeLanguage(language)
  }, [language])

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
