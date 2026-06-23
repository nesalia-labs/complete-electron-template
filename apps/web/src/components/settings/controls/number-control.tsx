'use client'
import { useEffect, useState } from 'react'
import { Input } from '@electron-template/ui/components/input'
import type { SettingDefinition } from '@electron-template/api/settings'

interface NumberControlProps {
  entry: SettingDefinition
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

/**
 * Numeric input. The number control is mainly a hook for PR 3 — no
 * built-in entries use it today, but the consumer extension point
 * (apps/web/src/settings/app-settings.ts) can register number fields.
 *
 * The entry schema is `z.number()`, so we coerce to a number before
 * calling onChange. The schema is the single source of truth for the
 * min/max bounds — we don't duplicate them here.
 */
export function NumberControl({
  value,
  onChange,
  disabled
}: NumberControlProps) {
  const [text, setText] = useState(() => String(value ?? ''))

  // Sync the local text with the external value when it changes (e.g. after
  // an optimistic update rollback or store reset).
  useEffect(() => {
    setText(String(value ?? ''))
  }, [value])

  return (
    <Input
      type="number"
      value={text}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        if (next === '') return
        const parsed = Number(next)
        if (!Number.isNaN(parsed)) onChange(parsed)
      }}
    />
  )
}
