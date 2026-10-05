import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Icon, type IconName } from './Icon'

export type ButtonVariant =
  'primary' | 'secondary' | 'destructive' | 'ghost' | 'glass'
export type ButtonSize = 'default' | 'large' | 'icon'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: IconName
  iconAfter?: IconName
  children?: ReactNode
}

export function Button({
  className,
  variant = 'primary',
  size = 'default',
  loading = false,
  disabled,
  icon,
  iconAfter,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'button',
        `button--${variant}`,
        `button--${size}`,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Icon className="button__spinner" name="loader" />
      ) : icon ? (
        <Icon name={icon} />
      ) : null}
      {children && <span>{children}</span>}
      {!loading && iconAfter ? <Icon name={iconAfter} /> : null}
    </button>
  )
}
