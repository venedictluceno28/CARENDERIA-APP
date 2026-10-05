export type AppErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'MENU_INACTIVE'
  | 'MENU_EXPIRED'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_SOLD_OUT'
  | 'PRICE_CHANGED'
  | 'INVALID_ITEMS'
  | 'DUPLICATE_ITEM'
  | 'INVALID_CUSTOMER_DETAILS'
  | 'INVALID_QUANTITY'
  | 'INVALID_LOCATION'
  | 'INVALID_PAYMENT_METHOD'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'RATE_LIMIT_UNAVAILABLE'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_IMAGE_CONTENT'
  | 'INVALID_MESSAGE'
  | 'INVALID_REACTION'
  | 'INVALID_ATTACHMENT'
  | 'INVALID_ATTACHMENT_PURPOSE'
  | 'ONLINE_PAYMENT_REQUIRED'
  | 'ATTACHMENT_ACCESS_DENIED'
  | 'EVIDENCE_EXPIRED'
  | 'CHECKOUT_FAILED'
  | 'GUEST_ACCESS_DENIED'
  | 'GUEST_ACCESS_EXPIRED'
  | 'AUTHORIZATION_REQUIRED'
  | 'REQUEST_FAILED'
  | 'ADMIN_REQUIRED'
  | 'UNKNOWN_ERROR'

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status?: number
  readonly details?: unknown

  constructor(
    code: AppErrorCode,
    message: string,
    status?: number,
    details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }
}

type ErrorEnvelope = {
  error?: { code?: string; message?: string; details?: unknown }
}

const knownCodes = new Set<AppErrorCode>([
  'CONFIGURATION_ERROR',
  'NETWORK_ERROR',
  'INVALID_REQUEST',
  'MENU_INACTIVE',
  'MENU_EXPIRED',
  'ITEM_NOT_FOUND',
  'ITEM_SOLD_OUT',
  'PRICE_CHANGED',
  'INVALID_ITEMS',
  'DUPLICATE_ITEM',
  'INVALID_CUSTOMER_DETAILS',
  'INVALID_QUANTITY',
  'INVALID_LOCATION',
  'INVALID_PAYMENT_METHOD',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'RATE_LIMIT_UNAVAILABLE',
  'INVALID_FILE_TYPE',
  'FILE_TOO_LARGE',
  'INVALID_IMAGE_CONTENT',
  'INVALID_MESSAGE',
  'INVALID_REACTION',
  'INVALID_ATTACHMENT',
  'INVALID_ATTACHMENT_PURPOSE',
  'ONLINE_PAYMENT_REQUIRED',
  'ATTACHMENT_ACCESS_DENIED',
  'EVIDENCE_EXPIRED',
  'CHECKOUT_FAILED',
  'GUEST_ACCESS_DENIED',
  'GUEST_ACCESS_EXPIRED',
  'AUTHORIZATION_REQUIRED',
  'REQUEST_FAILED',
  'ADMIN_REQUIRED',
  'UNKNOWN_ERROR',
])

export function toAppError(
  value: unknown,
  fallbackMessage = 'The request could not be completed.',
  status?: number,
): AppError {
  if (value instanceof AppError) return value
  const envelope = value as ErrorEnvelope | undefined
  const rawCode = envelope?.error?.code
  const code = knownCodes.has(rawCode as AppErrorCode)
    ? (rawCode as AppErrorCode)
    : 'UNKNOWN_ERROR'
  return new AppError(
    code,
    envelope?.error?.message || fallbackMessage,
    status,
    envelope?.error?.details,
  )
}
