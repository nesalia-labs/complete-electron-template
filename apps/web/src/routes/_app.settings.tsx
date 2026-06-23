import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPlaceholder,
})

function SettingsPlaceholder() {
  const { t } = useTranslation()
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">{t('nav.settings')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming in V2.2</p>
    </div>
  )
}