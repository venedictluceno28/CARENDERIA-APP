import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AppBackground, PageContainer } from '../../../components/layout/Page'
import { StoreIdentity } from '../../../components/layout/StoreIdentity'
import { Button } from '../../../components/ui/Button'
import { Field, Input } from '../../../components/ui/FormControls'
import { Icon } from '../../../components/ui/Icon'
import { GlassSurface } from '../../../components/ui/Surface'
import { useAdminSession } from '../auth-context'

type LoginFields = { email: string; password: string }

export function AdminLoginPage() {
  const { session, signIn, configurationError } = useAdminSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [loginError, setLoginError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFields>()

  if (session) return <Navigate to="/admin" replace />
  const destination =
    (location.state as { from?: string } | null)?.from ?? '/admin'

  return (
    <AppBackground className="admin-background">
      <main className="auth-page">
        <PageContainer className="auth-page__layout">
          <section className="auth-page__welcome">
            <StoreIdentity inverse subtitle="Owner workspace" />
            <div>
              <span className="auth-page__secure">
                <Icon name="lock" /> Secure owner access
              </span>
              <p className="eyebrow">Private admin area</p>
              <h1>Your store, made simpler.</h1>
              <p>
                Manage daily operations with clear, phone-friendly tools
                designed for a busy kitchen.
              </p>
            </div>
          </section>
          <GlassSurface className="login-panel" variant="strong">
            <span className="login-panel__icon">
              <Icon name="lock" />
            </span>
            <p className="eyebrow">Welcome back</p>
            <h2>Admin login</h2>
            <p className="supporting-text">
              Use the administrator account provisioned for this store.
            </p>
            <form
              className="form-stack login-form"
              onSubmit={handleSubmit(async ({ email, password }) => {
                setLoginError(null)
                try {
                  await signIn(email.trim(), password)
                  navigate(destination, { replace: true })
                } catch (error) {
                  setLoginError(
                    error instanceof Error
                      ? error.message
                      : 'Login could not be completed.',
                  )
                }
              })}
            >
              <Field htmlFor="admin-email" label="Email">
                <Input
                  id="admin-email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="owner@example.com"
                  type="email"
                  {...register('email', { required: 'Email is required.' })}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? 'admin-email-error' : undefined
                  }
                />
                {errors.email && (
                  <span
                    className="field__error"
                    id="admin-email-error"
                    role="alert"
                  >
                    {errors.email.message}
                  </span>
                )}
              </Field>
              <Field htmlFor="admin-password" label="Password">
                <Input
                  id="admin-password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  type="password"
                  {...register('password', {
                    required: 'Password is required.',
                  })}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? 'admin-password-error' : undefined
                  }
                />
                {errors.password && (
                  <span
                    className="field__error"
                    id="admin-password-error"
                    role="alert"
                  >
                    {errors.password.message}
                  </span>
                )}
              </Field>
              {(loginError || configurationError) && (
                <p className="alert" role="alert">
                  <Icon name="circle-alert" />
                  {loginError || configurationError}
                </p>
              )}
              <Button
                disabled={Boolean(configurationError)}
                loading={isSubmitting}
                size="large"
                type="submit"
              >
                Log in
              </Button>
            </form>
            <p className="login-panel__help">
              <Icon name="info" /> No public signup is available. Contact the
              store administrator if you need access.
            </p>
          </GlassSurface>
        </PageContainer>
      </main>
    </AppBackground>
  )
}
