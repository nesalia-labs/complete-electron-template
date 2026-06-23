import { createFileRoute, notFound } from '@tanstack/react-router'
import {
  builtInSettings,
  createSettingsRegistry
} from '@electron-template/api/settings'
import { appSettings } from '@/settings/app-settings'
import { SettingsSectionView } from '@/components/settings/settings-section-view'

const registry = createSettingsRegistry([...builtInSettings, ...appSettings])

export const Route = createFileRoute('/_app/settings/$section')({
  loader: ({ params }) => {
    const entries = registry.byGroup(params.section)
    if (entries.length === 0) {
      throw notFound()
    }
    return { section: params.section, entries }
  },
  component: SettingsSectionPage
})

function SettingsSectionPage() {
  const { entries } = Route.useLoaderData()
  return <SettingsSectionView entries={entries} />
}
