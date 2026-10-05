import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Button } from './Button'
import { Icon, type IconName } from './Icon'

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('skeleton', className)} />
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state--compact" role="status">
      <Icon className="state__loader" name="loader" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({
  icon = 'shopping-bag',
  title,
  description,
  action,
}: {
  icon?: IconName
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="state">
      <span className="state__icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string
  description: string
  onRetry?: () => void
}) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon">
        <Icon name="circle-alert" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary">
          Try again
        </Button>
      )}
    </div>
  )
}
