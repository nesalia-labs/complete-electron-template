import { createFileRoute, Outlet } from '@tanstack/react-router'
import {
  SidebarInset,
  SidebarProvider,
} from '@electron-template/ui/components/sidebar'
import { AppSidebar } from '@/components/sidebars/app-sidebar'
import { AppHeader } from '@/components/headers/app-header'
import { AppTitleBar } from '@/components/headers/app-title-bar'

export const Route = createFileRoute('/_app')({
  component: AppShell,
})

function AppShell() {
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