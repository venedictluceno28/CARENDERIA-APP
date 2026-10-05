import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function GlassSurface({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'subtle' | 'strong'
}) {
  return (
    <div
      className={cn('glass-surface', `glass-surface--${variant}`, className)}
      {...props}
    />
  )
}

export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn('card', interactive && 'card--interactive', className)}
      {...props}
    />
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('section-heading', className)}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}
