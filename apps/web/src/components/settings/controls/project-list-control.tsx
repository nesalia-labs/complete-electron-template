'use client'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { Card } from '@electron-template/ui/components/card'
import { Button } from '@electron-template/ui/components/button'
import { Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRecentProjects } from '@/hooks/useRecentProjects'
import { getORPCClient } from '@/lib/orpc'

/**
 * Recent projects list for Settings → Projects.
 *
 * PR 4 wires the data plane: this component reads via `useRecentProjects`
 * (TanStack Query → oRPC → recent_projects table) and renders the rows.
 * "Open project" is a no-op button until PR 5 lands the real open flow —
 * the visual affordance is here so the panel is recognisable end-to-end.
 *
 * States handled:
 *   - loading → muted "Loading..." text
 *   - error   → i18n'd message (settings.errors.loadFailed) via toast
 *   - empty   → i18n'd empty state (settings.projects.empty)
 *   - data    → list of Card rows, newest first
 */
export function ProjectListControl() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data, isLoading, error } = useRecentProjects(10)

  const deleteMutation = useMutation({
    mutationFn: ({ projectId }: { projectId: string }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (getORPCClient() as any).deleteRecentProject({ projectId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recent-projects'] }),
    onError: () => {
      toast.error(t('settings.errors.loadFailed', 'Failed to load recent projects. Please try again.'))
    }
  })

  if (isLoading) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t('common.loading', 'Loading...')}
      </div>
    )
  }

  if (error) {
    // Log the underlying error for DevTools recovery — the inline + toast
    // messages are user-facing only.
    // eslint-disable-next-line no-console
    console.error('[ProjectListControl] failed to load recent projects:', error)
    toast.error(t('settings.errors.loadFailed', 'Failed to load recent projects. Please try again.'))
    return (
      <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
        {t('settings.errors.loadFailed', 'Failed to load recent projects. Please try again.')}
      </div>
    )
  }

  const projects = data ?? []
  if (projects.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t('settings.projects.empty', 'No recent projects yet')}
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="recent-projects-list">
      {projects.map((p: { id: number; projectId: string; projectName: string; openedAt: string | Date }) => {
        const openedAt =
          p.openedAt instanceof Date ? p.openedAt : new Date(p.openedAt)
        return (
          <li key={p.id}>
            <Card size="sm" className="flex flex-row items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium" title={p.projectName}>
                  {p.projectName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('settings.projects.openedRelative', {
                    time: formatDistanceToNow(openedAt)
                  })}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  title={t('settings.projects.open', 'Open project')}
                  aria-label={t('settings.projects.open', 'Open project')}
                >
                  {t('settings.projects.open', 'Open project')}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('common.delete', 'Delete')}
                  onClick={() => deleteMutation.mutate({ projectId: p.projectId })}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}