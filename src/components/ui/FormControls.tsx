import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/utils'
import { Icon } from './Icon'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn('input', className)} {...props} />
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn('input textarea', className)}
      {...props}
    />
  )
})

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <span className="select-wrap">
      <select ref={ref} className={cn('input select', className)} {...props}>
        {children}
      </select>
      <Icon name="chevron-down" />
    </span>
  )
})

export function Field({
  label,
  htmlFor,
  description,
  error,
  required,
  children,
}: {
  label: string
  htmlFor: string
  description?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  const descriptionId = description ? `${htmlFor}-description` : undefined
  const errorId = error ? `${htmlFor}-error` : undefined
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {description && (
        <p className="field__description" id={descriptionId}>
          {description}
        </p>
      )}
      {children}
      {error && (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function ChoiceCard({
  type = 'radio',
  label,
  description,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  type?: 'radio' | 'checkbox'
  label: string
  description?: string
}) {
  return (
    <label className={cn('choice-card', className)}>
      <input type={type} {...props} />
      <span className="choice-card__control" aria-hidden="true">
        <Icon name="check" />
      </span>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  )
}
