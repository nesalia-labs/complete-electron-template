'use client'
import { useTranslation } from 'react-i18next'
import {
  NativeSelect,
  NativeSelectOption
} from '@electron-template/ui/components/native-select'
import type { SettingDefinition } from '@electron-template/api/settings'

interface SelectControlProps {
  entry: SettingDefinition
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

export function SelectControl({
  entry,
  value,
  onChange,
  disabled
}: SelectControlProps) {
  const { t } = useTranslation()
  const options = entry.control.options ?? []

  return (
    <NativeSelect
      value={String(value ?? '')}
      disabled={disabled}
      onChange={(e) => {
        const picked = options.find((o) => o.value === e.target.value)
        // Pass the raw string — the registry schema (e.g. languageSchema) parses
        // it on the oRPC boundary, so we don't have to know the type here.
        onChange(picked?.value ?? e.target.value)
      }}
    >
      {options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {t(option.labelKey)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
