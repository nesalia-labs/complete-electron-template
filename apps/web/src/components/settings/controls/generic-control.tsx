'use client'
import { SelectControl } from './select-control'
import { CardsControl } from './cards-control'
import { SwitchControl } from './switch-control'
import { ProjectListControl } from './project-list-control'
import { NumberControl } from './number-control'
import { TextControl } from './text-control'
import type { SettingDefinition } from '@electron-template/api/settings'
import { useSettings } from '@/hooks/useSettings'
import { useUpdateSetting } from '@/hooks/useUpdateSetting'

export function GenericControl({ entry }: { entry: SettingDefinition }) {
  const { data: settings } = useSettings()
  const update = useUpdateSetting()
  const value = settings?.[entry.key] ?? entry.default

  const onChange = (newValue: unknown) => {
    update.mutate({ key: entry.key, value: newValue })
  }

  switch (entry.control.type) {
    case 'select':
      return (
        <SelectControl
          entry={entry}
          value={value}
          onChange={onChange}
          disabled={update.isPending}
        />
      )
    case 'cards':
      return (
        <CardsControl
          entry={entry}
          value={value}
          onChange={onChange}
          disabled={update.isPending}
        />
      )
    case 'switch':
      return (
        <SwitchControl
          entry={entry}
          value={value}
          onChange={onChange}
          disabled={update.isPending}
        />
      )
    case 'number':
      return (
        <NumberControl
          entry={entry}
          value={value}
          onChange={onChange}
          disabled={update.isPending}
        />
      )
    case 'text':
      return (
        <TextControl
          entry={entry}
          value={value}
          onChange={onChange}
          disabled={update.isPending}
        />
      )
    case 'project-list':
      return <ProjectListControl />
    default:
      return null
  }
}
