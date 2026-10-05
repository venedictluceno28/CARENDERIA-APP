import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../../components/layout/AppHeader'
import { FontSizeControl } from '../../../components/layout/FontPreferenceProvider'
import { AppBackground, PageContainer } from '../../../components/layout/Page'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { GlassSurface, SectionHeading } from '../../../components/ui/Surface'
import { adminModules } from '../admin-modules'
import { useAdminSession } from '../auth-context'
import { useAdminProfile } from '../hooks/use-admin-profile'

export function AdminShellPage() {
  const navigate = useNavigate()
  const { session, signOut } = useAdminSession()
  const { data: profile } = useAdminProfile(session?.user.id)

  return (
    <AppBackground className="admin-background">
      <AppHeader
        admin
        subtitle="Admin workspace"
        actions={
          <Button
            aria-label="Log out"
            onClick={() => void signOut()}
            size="icon"
            variant="glass"
          >
            <Icon name="log-out" />
          </Button>
        }
      />
      <main>
        <PageContainer className="admin-shell">
          <section className="admin-welcome">
            <div>
              <p className="eyebrow">Magandang araw</p>
              <h1>{profile?.display_name || 'Store owner'}</h1>
              <p>What would you like to manage today?</p>
            </div>
            <span className="admin-welcome__account">
              <Icon name="user" /> {session?.user.email}
            </span>
          </section>
          <section aria-labelledby="admin-actions-title">
            <SectionHeading
              className="admin-section-heading"
              eyebrow="Store operations"
              title="Quick actions"
              description="Large, simple controls for daily work."
            />
            <div className="admin-module-grid">
              {adminModules.map((module) => (
                <button
                  className={`admin-module${module.enabled ? ' admin-module--enabled' : ' admin-module--disabled'}`}
                  disabled={!module.enabled}
                  key={module.title}
                  onClick={() => module.route && navigate(module.route)}
                  type="button"
                >
                  <span className="admin-module__icon">
                    <Icon name={module.icon} />
                  </span>
                  <span className="admin-module__copy">
                    <strong>{module.title}</strong>
                    <small>{module.description}</small>
                    <em>
                      {module.enabled ? 'Open workspace' : 'Coming later'}
                    </em>
                  </span>
                  <Icon className="admin-module__arrow" name="arrow-right" />
                </button>
              ))}
            </div>
          </section>
          <GlassSurface className="admin-preferences" variant="subtle">
            <div>
              <p className="eyebrow">Readability</p>
              <h2>Comfortable text size</h2>
              <p>
                Your choice is saved on this device. Backend settings
                integration is deferred.
              </p>
            </div>
            <FontSizeControl />
          </GlassSurface>
        </PageContainer>
      </main>
    </AppBackground>
  )
}
