import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'

type AppErrorBoundaryState = { hasError: boolean }

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('Application render failure', {
        errorType: error.name,
        componentStack: info.componentStack,
      })
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="app-error-boundary" role="alert">
        <section>
          <span className="app-error-boundary__icon">
            <Icon name="circle-alert" />
          </span>
          <p className="eyebrow">Safe recovery</p>
          <h1>Something went wrong</h1>
          <p>
            The page could not be displayed. Your account permissions and saved
            records were not changed.
          </p>
          <div>
            <Button onClick={() => this.setState({ hasError: false })}>
              Try again
            </Button>
            <Button
              onClick={() => window.location.assign('/admin')}
              variant="secondary"
            >
              Back to admin
            </Button>
          </div>
        </section>
      </main>
    )
  }
}
