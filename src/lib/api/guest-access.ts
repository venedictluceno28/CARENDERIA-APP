import type { GuestOrderSession } from '../guest-session'
import { getSupabasePublicConfig } from '../supabase/client'
import { callPublicEdge } from './edge'

type GuestIdentity = Pick<GuestOrderSession, 'orderCode' | 'guestToken'>

export type GuestReceipt = {
  order_code: string
  customer_name: string
  exact_address: string
  location_classification: 'NEARBY' | 'OUTSIDE'
  selected_area_name: string | null
  payment_method: 'CASH' | 'ONLINE_PAYMENT'
  payment_verification_state: 'NOT_VERIFIED' | 'VERIFIED' | null
  food_subtotal_centavos: number
  customer_delivery_charge_centavos: number
  grand_total_centavos: number
  is_cancelled: boolean
  created_at: string
  guest_expires_at: string
  items: Array<{
    name: string
    category: 'ULAM' | 'DESSERTS' | 'EXTRAS'
    quantity: number
    unit_price_centavos: number
    item_subtotal_centavos: number
  }>
}

export type GuestMessagePage = {
  conversation_id: string
  expires_at: string
  messages: Array<{
    id: string
    sender_type: 'GUEST' | 'ADMIN'
    text: string | null
    guest_reaction: string | null
    admin_reaction: string | null
    created_at: string
    attachments: GuestMessageAttachment[]
  }>
}

export type GuestMessage = GuestMessagePage['messages'][number]

export type GuestMessageAttachment = {
  id: string
  purpose: 'CHAT_IMAGE' | 'PAYMENT_EVIDENCE'
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp'
  size_bytes: number
  created_at: string
}

function postGuest<T>(identity: GuestIdentity, action: string, extra = {}) {
  return callPublicEdge<T>(
    'guest-access',
    JSON.stringify({ ...identity, action, ...extra }),
    'application/json',
  )
}

export const getGuestReceipt = (identity: GuestIdentity) =>
  postGuest<GuestReceipt>(identity, 'receipt')

export const listGuestMessages = (
  identity: GuestIdentity,
  options?: { before?: string; limit?: number },
) => postGuest<GuestMessagePage>(identity, 'list_messages', options)

export const sendGuestMessage = (identity: GuestIdentity, text: string) =>
  postGuest(identity, 'send_message', { text })

export const reactToGuestMessage = (
  identity: GuestIdentity,
  messageId: string,
  reaction: string | null,
) => postGuest<void>(identity, 'react', { messageId, reaction })

export const getGuestAttachmentUrl = (
  identity: GuestIdentity,
  attachmentId: string,
) =>
  postGuest<{ signedUrl: string; expiresIn: number }>(identity, 'signed_read', {
    attachmentId,
  })

export async function getGuestAttachmentSignedUrl(
  identity: GuestIdentity,
  attachmentId: string,
): Promise<{ url: string; expiresIn: number }> {
  const result = await getGuestAttachmentUrl(identity, attachmentId)
  return {
    url: new URL(result.signedUrl, getSupabasePublicConfig().url).toString(),
    expiresIn: result.expiresIn,
  }
}

export function uploadGuestImage(
  identity: GuestIdentity,
  file: File,
  purpose: 'CHAT_IMAGE' | 'PAYMENT_EVIDENCE',
  text?: string,
) {
  const form = new FormData()
  form.set('orderCode', identity.orderCode)
  form.set('guestToken', identity.guestToken)
  form.set('purpose', purpose)
  form.set('file', file)
  if (text) form.set('text', text)
  return callPublicEdge<Record<string, unknown>>('guest-access', form)
}
