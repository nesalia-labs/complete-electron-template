'use client'
import { useTranslation } from 'react-i18next'
import { cn } from '@electron-template/ui/lib/utils'
import type { SettingDefinition } from '@electron-template/api/settings'

interface CardsControlProps {
  entry: SettingDefinition
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
}

/**
 * Side-by-side radio cards. Used for the theme picker (Light / Dark / System).
 * Each card is a button with role="radio" so screen readers announce the
 * group semantics correctly.
 */
export function CardsControl({
  entry,
  value,
  onChange,
  disabled
}: CardsControlProps) {
  const { t } = useTranslation()
  const options = entry.control.options ?? []
  const groupLabel = t(entry.labelKey as any)

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      className="grid grid-cols-3 gap-3"
    >
      {options.map((option) => {
        const isSelected = String(value) === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-lg p-4 text-sm transition-colors',
              'border bg-card text-card-foreground',
              isSelected
                ? 'border-2 border-primary bg-primary/5 font-medium'
                : 'border-border hover:border-primary/50 hover:bg-accent/50'
            )}
          >
            <span>{t(option.labelKey as any)}</span>
          </button>
        )
      })}
    </div>
  )
}
