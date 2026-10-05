import type {
  GuestMessage,
  GuestMessagePage,
  GuestReceipt,
} from '../../../lib/api/guest-access.ts'
import { AppError } from '../../../lib/api/errors.ts'

export const MAX_MESSAGE_LENGTH = 2_000
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const GUEST_REACTIONS = ['👍', '❤️', '🙏'] as const

export type SelectedImageLike = { name: string; type: string; size: number }

export function validateSelectedImage(file: SelectedImageLike): string | null {
  if (
    !ACCEPTED_IMAGE_TYPES.includes(
      file.type as (typeof ACCEPTED_IMAGE_TYPES)[number],
    )
  )
    return 'Choose a JPEG, PNG, or WebP image.'
  if (file.size < 1) return 'Choose a non-empty image.'
  if (file.size > MAX_IMAGE_BYTES) return 'Image must be 5 MB or smaller.'
  return null
}

export function canSubmitMessage(text: string, hasImage: boolean): boolean {
  return (
    (Boolean(text.trim()) || hasImage) &&
    text.trim().length <= MAX_MESSAGE_LENGTH
  )
}

export function mergeMessagePages(pages: GuestMessagePage[]): GuestMessage[] {
  const byId = new Map<string, GuestMessage>()
  for (const page of pages) {
    for (const message of page.messages) byId.set(message.id, message)
  }
  return [...byId.values()].sort(
    (left, right) =>
      Date.parse(left.created_at) - Date.parse(right.created_at) ||
      left.id.localeCompare(right.id),
  )
}

export function showsPaymentEvidenceAction(
  receipt: Pick<GuestReceipt, 'payment_method'>,
): boolean {
  return receipt.payment_method === 'ONLINE_PAYMENT'
}

export function guestPaymentStatus(
  receipt: Pick<GuestReceipt, 'payment_method' | 'payment_verification_state'>,
): 'Verified' | 'Not Verified' | null {
  if (receipt.payment_method === 'CASH') return null
  return receipt.payment_verification_state === 'VERIFIED'
    ? 'Verified'
    : 'Not Verified'
}

export function nextGuestReaction(
  current: string | null,
  selected: string,
): string | null {
  return current === selected ? null : selected
}

export function messagingErrorMessage(error: unknown): string {
  if (!(error instanceof AppError))
    return 'We couldn’t complete that request. Check your connection and try again.'
  if (error.code === 'RATE_LIMITED') {
    const seconds = retryAfterSeconds(error.details)
    return seconds
      ? `Please wait about ${seconds} seconds before trying again.`
      : 'Too many attempts were made. Please wait a moment and try again.'
  }
  if (
    error.code === 'GUEST_ACCESS_EXPIRED' ||
    error.code === 'GUEST_ACCESS_DENIED' ||
    error.code === 'AUTHORIZATION_REQUIRED'
  ) {
    return 'Guest messaging for this order is no longer available.'
  }
  if (error.code === 'FILE_TOO_LARGE') return 'Image must be 5 MB or smaller.'
  if (error.code === 'INVALID_FILE_TYPE')
    return 'Choose a JPEG, PNG, or WebP image.'
  if (error.code === 'INVALID_IMAGE_CONTENT')
    return 'This image could not be accepted. Choose another JPEG, PNG, or WebP image.'
  if (error.code === 'ATTACHMENT_ACCESS_DENIED')
    return 'This private image is not available for guest viewing.'
  if (error.code === 'NETWORK_ERROR')
    return 'The message was not confirmed. Your draft is still here—please try again.'
  return 'We couldn’t complete that request. Please try again.'
}

function retryAfterSeconds(details: unknown): number | null {
  if (!details || typeof details !== 'object') return null
  const value = Number((details as Record<string, unknown>).retryAfterSeconds)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}
