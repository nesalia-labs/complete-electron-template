import { useTranslation } from 'react-i18next'
import { Link, useMatch } from '@tanstack/react-router'
import { House, Settings, Zap } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from '@electron-template/ui/components/sidebar'
import type { LucideIcon } from 'lucide-react'

type NavItem = {
  to: '/' | '/settings'
  routeId: '/_app/' | '/_app/settings'
  icon: LucideIcon
  labelKey: 'nav.projects' | 'nav.settings'
  tooltipKey: 'nav.projects' | 'nav.settings'
}

export const navItems: Array<NavItem> = [
  {
    to: '/',
    routeId: '/_app/',
    icon: House,
    labelKey: 'nav.projects',
    tooltipKey: 'nav.projects',
  },
  {
    to: '/settings',
    routeId: '/_app/settings',
    icon: Settings,
    labelKey: 'nav.settings',
    tooltipKey: 'nav.settings',
  },
]

function NavItem({ to, routeId, icon: Icon, labelKey, tooltipKey }: NavItem) {
  const { t } = useTranslation()
  const match = useMatch({ from: routeId, shouldThrow: false })
  const isActive = Boolean(match)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={t(tooltipKey)}
      >
        <Link to={to} aria-current={isActive ? 'page' : undefined}>
          <Icon />
          <span>{t(labelKey)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  return (
    <Sidebar
      collapsible="icon"
      className="top-8! h-[calc(100vh-2rem)]!"
    >
      <SidebarHeader className="h-12 border-b border-border">
        <div className="flex h-full items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Electron App
          </span>
          <div className="hidden size-8 items-center justify-center rounded-sm border border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground group-data-[collapsible=icon]:flex">
            <Zap className="size-4" />
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems
              .filter((item) => item.to === '/')
              .map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            {navItems
              .filter((item) => item.to === '/settings')
              .map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="h-12 border-t border-border">
        <div className="flex h-full items-center justify-end px-2 group-data-[collapsible=icon]:justify-center">
          <SidebarTrigger />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}