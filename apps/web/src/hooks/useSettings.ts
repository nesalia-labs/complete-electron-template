import { useQuery } from '@tanstack/react-query'
import { getORPCClient } from '@/lib/orpc'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () =>
      // TypeScript 6 has known friction with oRPC client types — see
      // apps/web/src/lib/orpc.ts:24 and packages/api/CLAUDE.md for context.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (getORPCClient() as any).getSettings({ keys: undefined }),
    staleTime: Infinity
  })
}
