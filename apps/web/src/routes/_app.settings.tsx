import { createFileRoute, Outlet } from '@tanstack/react-router'
import {
  builtInSettings,
  createSettingsRegistry
} from '@electron-template/api/settings'
import type { SettingsSubNavItem } from '@/components/settings/settings-sub-nav'
import { SettingsSubNav } from '@/components/settings/settings-sub-nav'
import { appSettings } from '@/settings/app-settings'

// Build the consumer registry at module init. Order is preserved (see
// packages/api/src/settings/registry.ts), so the sub-nav reflects the order
// entries are declared: language → theme → sidebarCollapsed → recentProjects.
const registry = createSettingsRegistry([...builtInSettings, ...appSettings])

const subNavItems: Array<SettingsSubNavItem> = registry.groups().map((g) => ({
  groupKey: String(g),
  labelKey: `settings.section.${g}`,
  to: `/settings/${g}` as `/settings/${string}`
}))

export const Route = createFileRoute('/_app/settings')({
  component: SettingsLayout
})

function SettingsLayout() {
  return (
    <div className="flex h-full">
      <SettingsSubNav items={subNavItems} />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
