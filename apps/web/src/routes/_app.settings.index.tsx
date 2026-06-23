import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  builtInSettings,
  createSettingsRegistry
} from '@electron-template/api/settings'
import { appSettings } from '@/settings/app-settings'

const registry = createSettingsRegistry([...builtInSettings, ...appSettings])
const firstGroup = String(registry.groups()[0] ?? 'general')

export const Route = createFileRoute('/_app/settings/')({
  beforeLoad: () => {
    throw redirect({ to: `/settings/${firstGroup}` as never })
  }
})
