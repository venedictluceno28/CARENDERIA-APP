import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '../api/errors'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

let browserClient: SupabaseClient | undefined

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AppError(
      'CONFIGURATION_ERROR',
      'Supabase browser configuration is missing.',
    )
  }

  browserClient ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return browserClient
}

export function getSupabasePublicConfig() {
  if (!supabaseUrl || !supabaseAnonKey) getSupabaseClient()
  return { url: supabaseUrl as string, anonKey: supabaseAnonKey as string }
}
