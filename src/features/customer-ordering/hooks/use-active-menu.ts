import { useQuery } from '@tanstack/react-query'
import { loadActiveMenu } from '../api/public-menu'
import { customerActiveMenuQueryKey } from '../../../lib/query-keys.ts'

export const activeMenuQueryKey = customerActiveMenuQueryKey

export function useActiveMenu() {
  return useQuery({
    queryKey: activeMenuQueryKey,
    queryFn: loadActiveMenu,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 2,
  })
}
