import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { PageContainer } from './Page'
import { StoreIdentity } from './StoreIdentity'

export function AppHeader({
  storeName,
  subtitle,
  actions,
  admin = false,
  className,
}: {
  storeName?: string | null
  subtitle?: string
  actions?: ReactNode
  admin?: boolean
  className?: string
}) {
  return (
    <header className={cn('app-header', className)}>
      <PageContainer className="app-header__inner">
        <StoreIdentity
          compact
          storeName={storeName}
          subtitle={subtitle}
          inverse={admin}
        />
        {actions && <div className="app-header__actions">{actions}</div>}
      </PageContainer>
    </header>
  )
}
