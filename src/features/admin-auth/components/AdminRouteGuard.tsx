import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { AppBackground, PageContainer } from '../../../components/layout/Page'
import { Button } from '../../../components/ui/Button'
import { LoadingState } from '../../../components/ui/Feedback'
import { GlassSurface } from '../../../components/ui/Surface'
import { useAdminSession } from '../auth-context'
import { useAdminProfile } from '../hooks/use-admin-profile'

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { session, isRestoring, signOut } = useAdminSession()
  const profile = useAdminProfile(session?.user.id)

  if (isRestoring) return <StatusPanel message="Restoring your session…" />
  if (!session) return <Navigate to="/admin/login" replace />
  if (profile.isPending)
    return <StatusPanel message="Verifying admin access…" />
  if (profile.isError || !profile.data)
    return (
      <StatusPanel message="This account does not have active administrator access.">
        <Button onClick={() => void signOut()}>Sign out</Button>
      </StatusPanel>
    )
  return children
}

function StatusPanel({
  message,
  children,
}: {
  message: string
  children?: ReactNode
}) {
  return (
    <AppBackground className="admin-background">
      <main className="status-page">
        <PageContainer>
          <GlassSurface className="status-panel" variant="strong">
            <LoadingState label={message} />
            {children}
          </GlassSurface>
        </PageContainer>
      </main>
    </AppBackground>
  )
}
