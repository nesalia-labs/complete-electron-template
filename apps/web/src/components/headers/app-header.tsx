import { useTranslation } from 'react-i18next'
import { SidebarTrigger } from '@electron-template/ui/components/sidebar'

import { LanguageSwitcher } from '../language-switcher'

export function AppHeader() {
  const { t } = useTranslation()

  return (
    <header className="sticky top-8 z-10 flex h-12 items-center justify-between gap-2 border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <span className="text-sm font-semibold">{t('app.title')}</span>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
      </div>
    </header>
  )
}