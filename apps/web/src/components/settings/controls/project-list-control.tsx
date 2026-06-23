'use client'
import { useTranslation } from 'react-i18next'

/**
 * Project list placeholder for PR 3. The data layer (recent_projects table +
 * projects.updateRecent procedure) ships in PR 4. Until then this component
 * just renders the i18n-driven empty state.
 */
export function ProjectListControl() {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {t('settings.projects.empty', 'No recent projects yet')}
    </div>
  )
}
