import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const controlledClose = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') {
        controlledClose.current = true
        dialog.close()
      } else {
        dialog.removeAttribute('open')
      }
    }
  }, [open])

  return (
    <dialog
      className="dialog"
      ref={ref}
      aria-labelledby="dialog-title"
      aria-describedby={description ? 'dialog-description' : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onOpenChange(false)
      }}
      onClose={() => {
        if (controlledClose.current) {
          controlledClose.current = false
          return
        }
        onOpenChange(false)
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <div className="dialog__surface">
        <header className="dialog__header">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description && <p id="dialog-description">{description}</p>}
          </div>
          <Button
            aria-label="Close dialog"
            onClick={() => onOpenChange(false)}
            size="icon"
            variant="ghost"
          >
            <Icon name="x" />
          </Button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </dialog>
  )
}
