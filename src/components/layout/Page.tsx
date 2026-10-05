import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function AppBackground({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('app-background', className)}>
      <div aria-hidden="true" className="ambient ambient--one" />
      <div aria-hidden="true" className="ambient ambient--two" />
      {children}
    </div>
  )
}

export function PageContainer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('page-container', className)} {...props} />
}

export function MobileStickyAction({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mobile-sticky-action', className)}>
      <div className="page-container">{children}</div>
    </div>
  )
}
