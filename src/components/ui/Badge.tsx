import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'
import { Icon } from './Icon'

export type BadgeVariant =
  | 'available'
  | 'sold-out'
  | 'verified'
  | 'unverified'
  | 'cancelled'
  | 'free'
  | 'cash'
  | 'online'
  | 'info'

const iconByVariant: Record<
  BadgeVariant,
  'check' | 'x' | 'clock' | 'circle-alert' | 'sparkles' | 'receipt' | 'info'
> = {
  available: 'check',
  'sold-out': 'x',
  verified: 'check',
  unverified: 'clock',
  cancelled: 'x',
  free: 'sparkles',
  cash: 'receipt',
  online: 'info',
  info: 'info',
}

export function Badge({
  className,
  variant = 'info',
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span className={cn('badge', `badge--${variant}`, className)} {...props}>
      <Icon name={iconByVariant[variant]} />
      {children}
    </span>
  )
}
