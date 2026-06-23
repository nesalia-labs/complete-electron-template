'use client'
import { Link, useMatch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@electron-template/ui/lib/utils'

export interface SettingsSubNavItem {
  to: '/settings/' | `/settings/${string}`
  groupKey: string
  labelKey: string
}

export function SettingsSubNav({ items }: { items: Array<SettingsSubNavItem> }) {
  const { t } = useTranslation()
  return (
    <nav className="flex flex-col gap-1 border-r border-border w-56 shrink-0">
      {/* Header mirrors AppSidebar's SidebarHeader (h-12 + border-b) so the
          settings sub-nav visually matches the main sidebar's hierarchy. */}
      <div className="flex h-12 shrink-0 items-center border-b border-border px-2">
        <span className="text-sm font-semibold">
          {t('settings.title', 'Settings')}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-2">
        {items.map((item) => (
          <SettingsSubNavLink key={item.groupKey} item={item} t={t} />
        ))}
      </div>
    </nav>
  )
}

function SettingsSubNavLink({
  item,
  t
}: {
  item: SettingsSubNavItem
  t: (key: string) => string
}) {
  // Match the dynamic `/settings/$section` route so we can derive the active
  // group from the URL. shouldThrow: false makes this safe during transitions.
  const match: { section: string } | undefined = useMatch({
    from: '/_app/settings/$section',
    shouldThrow: false
  })
  const isActive = Boolean(match && match.section === item.groupKey)

  return (
    <Link
      // Cast to the registered route path type — TanStack's strict typed-route
      // union is the only place this friction shows up (TS 6 / oRPC same fix
      // pattern as apps/web/src/lib/orpc.ts:24).
      to={item.to as never}
      className={cn(
        'rounded-md px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-sidebar-accent/50'
      )}
    >
      {t(item.labelKey)}
    </Link>
  )
}
