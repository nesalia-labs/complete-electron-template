'use client'
import { Switch } from '@electron-template/ui/components/switch'
import type { SettingDefinition } from '@electron-template/api/settings'

interface SwitchControlProps {
  entry: SettingDefinition
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

export function SwitchControl({
  value,
  onChange,
  disabled
}: SwitchControlProps) {
  const isChecked = Boolean(value)

  return (
    <Switch
      checked={isChecked}
      disabled={disabled}
      onCheckedChange={(next) => onChange(next)}
    />
  )
}
