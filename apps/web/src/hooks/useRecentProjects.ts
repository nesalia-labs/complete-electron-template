import { useQuery } from '@tanstack/react-query'
import { getORPCClient } from '@/lib/orpc'

/**
 * Fetch the list of recent projects for the Settings → Projects panel.
 *
 * The query key `['recent-projects', limit]` is stable per-limit so
 * TanStack Query can dedupe across components that ask for the same list.
 *
 * The `as any` cast on the client is the established workaround for the
 * TS 6 / oRPC client type friction (see apps/web/src/lib/orpc.ts:24 and
 * packages/api/CLAUDE.md for context).
 */
export function useRecentProjects(limit = 10) {
  return useQuery({
    queryKey: ['recent-projects', limit],
    queryFn: () =>
       
      (getORPCClient() as any).listRecentProjects({ limit }),
    staleTime: 30_000
  })
}