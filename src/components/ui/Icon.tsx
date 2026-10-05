import type { SVGProps } from 'react'
import { cn } from '../../lib/utils'

export type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'book-user'
  | 'camera'
  | 'cart'
  | 'check'
  | 'chef-hat'
  | 'chevron-down'
  | 'circle-alert'
  | 'clock'
  | 'image'
  | 'info'
  | 'loader'
  | 'lock'
  | 'log-out'
  | 'mail'
  | 'message'
  | 'minus'
  | 'orders'
  | 'plus'
  | 'receipt'
  | 'settings'
  | 'shopping-bag'
  | 'sparkles'
  | 'store'
  | 'user'
  | 'x'

const paths: Record<IconName, React.ReactNode> = {
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  'book-user': (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <circle cx="12" cy="8" r="2" />
      <path d="M8.5 14c.8-2.2 6.2-2.2 7 0" />
    </>
  ),
  camera: (
    <>
      <path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1" />
      <circle cx="19" cy="20" r="1" />
      <path d="M3 4h2l2.4 10.4A2 2 0 0 0 9.3 16H18a2 2 0 0 0 1.9-1.4L22 7H6" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  'chef-hat': (
    <>
      <path d="M6.5 11a4 4 0 0 1 1.2-7.8A5 5 0 0 1 17 5a3.5 3.5 0 0 1 .5 6" />
      <path d="M6 11v8h12v-8" />
      <path d="M8 15h8" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'circle-alert': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 15-4-4L5 20" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  loader: (
    <>
      <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  'log-out': (
    <>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  message: (
    <>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  orders: (
    <>
      <path d="M6 3h12v18H6z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  receipt: (
    <>
      <path d="M6 3v18l3-2 3 2 3-2 3 2V3l-3 2-3-2-3 2Z" />
      <path d="M9 10h6M9 14h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  'shopping-bag': (
    <>
      <path d="M5 8h14l-1 13H6Z" />
      <path d="M9 10V6a3 3 0 0 1 6 0v4" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z" />
      <path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7Z" />
      <path d="m5 13 .7 2.3L8 16l-2.3.7L5 19l-.7-2.3L2 16l2.3-.7Z" />
    </>
  ),
  store: (
    <>
      <path d="M3 9 5 4h14l2 5" />
      <path d="M5 13v8h14v-8" />
      <path d="M9 21v-6h6v6" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
}

export function Icon({
  name,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('icon', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
