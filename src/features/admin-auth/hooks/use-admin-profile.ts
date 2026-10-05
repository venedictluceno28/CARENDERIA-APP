import { useQuery } from '@tanstack/react-query'
import { getCurrentAdminProfile } from '../api/admin-profile'

export function useAdminProfile(userId?: string) {
  return useQuery({
    queryKey: ['admin-profile', userId],
    queryFn: () => getCurrentAdminProfile(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: false,
  })
}
