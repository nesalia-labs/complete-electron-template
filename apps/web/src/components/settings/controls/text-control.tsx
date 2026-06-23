'use client'
import { Input } from '@electron-template/ui/components/input'
import type { SettingDefinition } from '@electron-template/api/settings'

interface TextControlProps {
  entry: SettingDefinition
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

/**
 * Plain text input. No built-in entries use it today, but exposed for the
 * consumer extension point (apps/web/src/settings/app-settings.ts).
 */
export function TextControl({
  value,
  onChange,
  disabled
}: TextControlProps) {
  return (
    <Input
      type="text"
      value={String(value ?? '')}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
