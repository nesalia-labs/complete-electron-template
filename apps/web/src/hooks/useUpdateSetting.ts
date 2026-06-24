import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { getORPCClient } from '@/lib/orpc'

export function useUpdateSetting() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      // TypeScript 6 has known friction with oRPC client types — see
      // apps/web/src/lib/orpc.ts:24 and packages/api/CLAUDE.md for context.
       
      (getORPCClient() as any).updateSetting({ key, value }),
    onMutate: async ({ key, value }) => {
      await qc.cancelQueries({ queryKey: ['settings'] })
      const previous = qc.getQueryData<Record<string, unknown>>(['settings'])
      qc.setQueryData<Record<string, unknown>>(['settings'], (old) => ({
        ...(old ?? {}),
        [key]: value
      }))
      return { previous }
    },
    onError: (err, _vars, context) => {
      // Log the underlying error so it's recoverable from DevTools, not just
      // the user-facing toast. Sonner swallows the original error.
       
      console.error('[useUpdateSetting] failed:', err)
      toast.error(t('settings.errors.saveFailed', 'Failed to save settings. Please try again.'))
      if (context?.previous) qc.setQueryData(['settings'], context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['settings'] })
  })
}
