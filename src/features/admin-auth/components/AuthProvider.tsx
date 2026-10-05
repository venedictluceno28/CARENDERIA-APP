import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from '../../../lib/supabase/client'
import { AuthContext, type AuthContextValue } from '../auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const queryClient = useQueryClient()
  const configurationError = isSupabaseConfigured()
    ? null
    : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use admin login.'

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsRestoring(false)
      return
    }
    const client = getSupabaseClient()
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsRestoring(false)
    })
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsRestoring(false)
      void queryClient.invalidateQueries({ queryKey: ['admin-profile'] })
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isRestoring,
      configurationError,
      async signIn(email, password) {
        const { error } = await getSupabaseClient().auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw new Error('Email or password is incorrect.')
      },
      async signOut() {
        await getSupabaseClient().auth.signOut()
        queryClient.removeQueries({ queryKey: ['admin-profile'] })
      },
    }),
    [configurationError, isRestoring, queryClient, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
