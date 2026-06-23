'use client'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@electron-template/ui/components/card'
import { GenericControl } from './controls/generic-control'
import { ProjectListControl } from './controls/project-list-control'
import type { RegistryEntry } from '@electron-template/api/settings'

export function SettingsSectionView({ entries }: { entries: Array<RegistryEntry> }) {
  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl">
      {entries.map((entry) => (
        <Card key={entry.key}>
          <CardHeader>
            <CardTitle>
              <EntryLabel entry={entry} />
            </CardTitle>
            <CardDescription>
              <EntryDescription entry={entry} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EntryControl entry={entry} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/**
 * Dispatches to the right control based on whether the entry is a
 * `SettingDefinition` (auto-generates a UI control) or a `GlobalDbEntry`
 * (placeholder like the projects list).
 */
function EntryControl({ entry }: { entry: RegistryEntry }) {
  // GlobalDb entries (e.g. recentProjects) are placeholders — they have no
  // schema/default/control. Render their declared `render` hint.
  if ('source' in entry) {
    if (entry.render === 'project-list') return <ProjectListControl />
    return null
  }
  // Real settings entries get the auto-generated control.
  return <GenericControl entry={entry} />
}

function EntryLabel({ entry }: { entry: RegistryEntry }) {
  const { t } = useTranslation()
  return <>{t(entry.labelKey as any)}</>
}

function EntryDescription({ entry }: { entry: RegistryEntry }) {
  const { t } = useTranslation()
  // Pass the key itself as the default — the i18n string is the value of
  // the last path segment (e.g. "settings.fields.recentProjectsDescription").
  return <>{t(entry.descriptionKey as any, '')}</>
}
