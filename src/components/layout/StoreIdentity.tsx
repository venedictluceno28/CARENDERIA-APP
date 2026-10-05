import { cn } from '../../lib/utils'
import { Icon } from '../ui/Icon'

export function StoreIdentity({
  storeName = 'Tindahan',
  subtitle,
  compact = false,
  inverse = false,
}: {
  storeName?: string | null
  subtitle?: string
  compact?: boolean
  inverse?: boolean
}) {
  return (
    <div
      className={cn(
        'store-identity',
        compact && 'store-identity--compact',
        inverse && 'store-identity--inverse',
      )}
    >
      <span className="store-identity__mark" aria-hidden="true">
        <Icon name="store" />
      </span>
      <span className="store-identity__copy">
        <strong>{storeName || 'Your local carenderia'}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </div>
  )
}
