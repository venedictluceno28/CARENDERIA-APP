import { getSupabaseClient } from '../../../lib/supabase/client'
import type { AdminProfile } from '../types'

export async function getCurrentAdminProfile(
  userId: string,
): Promise<AdminProfile | null> {
  const { data, error } = await getSupabaseClient()
    .from('admin_profiles')
    .select('user_id, display_name, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error('Admin authorization could not be verified.')
  return data as AdminProfile | null
}
