import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { AppHeader } from './AppHeader'

export function AdminPageHeader({
  subtitle,
  onLogout,
  backTo = '/admin',
}: {
  subtitle: string
  onLogout: () => void | Promise<void>
  backTo?: string
}) {
  const navigate = useNavigate()
  return (
    <AppHeader
      admin
      className="app-header--admin-subpage"
      subtitle={subtitle}
      actions={
        <>
          <Button
            className="admin-back-button"
            icon="arrow-left"
            onClick={() => navigate(backTo)}
            variant="glass"
          >
            Back
          </Button>
          <Button
            aria-label="Log out"
            onClick={() => void onLogout()}
            size="icon"
            variant="glass"
          >
            <Icon name="log-out" />
          </Button>
        </>
      }
    />
  )
}
