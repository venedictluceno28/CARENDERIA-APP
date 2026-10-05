import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AuthContextValue = {
  session: Session | null
  isRestoring: boolean
  configurationError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAdminSession(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value)
    throw new Error('useAdminSession must be used within AuthProvider.')
  return value
}
