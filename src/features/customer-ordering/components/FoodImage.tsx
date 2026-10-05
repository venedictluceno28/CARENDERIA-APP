import { useState } from 'react'
import { Icon } from '../../../components/ui/Icon'
import { cn } from '../../../lib/utils'

export function FoodImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={cn('food-image', className)}>
      {!src || failed ? (
        <span
          className="food-image__fallback"
          aria-label={`No image for ${alt}`}
          role="img"
        >
          <Icon name="chef-hat" />
        </span>
      ) : (
        <img
          alt={alt}
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          src={src}
        />
      )}
    </div>
  )
}
