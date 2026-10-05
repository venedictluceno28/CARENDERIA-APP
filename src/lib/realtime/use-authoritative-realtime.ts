import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '../supabase/client.ts'

export type RealtimeSignalReason = 'activity' | 'reconnected' | 'resumed'

export function useAuthoritativeRealtime({
  enabled = true,
  onSignal,
  privateChannel = false,
  topic,
}: {
  enabled?: boolean
  onSignal: (reason: RealtimeSignalReason) => void
  privateChannel?: boolean
  topic?: string
}) {
  const signalRef = useRef(onSignal)

  useEffect(() => {
    signalRef.current = onSignal
  }, [onSignal])

  useEffect(() => {
    if (!enabled || !topic) return

    const supabase = getSupabaseClient()
    let subscribed = false
    let recoveryTimer: number | undefined
    const channel = supabase
      .channel(topic, { config: { private: privateChannel } })
      .on('broadcast', { event: 'activity' }, () => {
        signalRef.current('activity')
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        if (subscribed) signalRef.current('reconnected')
        subscribed = true
      })

    const recover = () => {
      signalRef.current('resumed')
      window.clearTimeout(recoveryTimer)
      recoveryTimer = window.setTimeout(
        () => signalRef.current('resumed'),
        1_000,
      )
    }
    const recoverWhenVisible = () => {
      if (document.visibilityState === 'visible') recover()
    }

    window.addEventListener('focus', recover)
    window.addEventListener('online', recover)
    document.addEventListener('visibilitychange', recoverWhenVisible)

    return () => {
      window.removeEventListener('focus', recover)
      window.removeEventListener('online', recover)
      document.removeEventListener('visibilitychange', recoverWhenVisible)
      window.clearTimeout(recoveryTimer)
      void supabase.removeChannel(channel)
    }
  }, [enabled, privateChannel, topic])
}
