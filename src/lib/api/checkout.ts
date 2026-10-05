import { saveGuestOrderSession } from '../guest-session'
import { createSecureUuid } from '../secure-random-uuid'
import { callPublicEdge } from './edge'

export type CheckoutLine = {
  publishedMenuItemId: string
  quantity: number
  expectedUnitPriceCentavos: number
}

export type CheckoutIntent = {
  publishedMenuId: string
  items: CheckoutLine[]
  customerName: string
  exactAddress: string
  locationClassification: 'NEARBY' | 'OUTSIDE'
  selectedAreaName?: string | null
  paymentMethod: 'CASH' | 'ONLINE_PAYMENT'
}

export type CheckoutAttempt = {
  idempotencyKey: string
  guestToken: string
}

export type CheckoutResult = {
  order_id: string
  order_code: string
  created_at: string
  guest_expires_at: string
  payment_method: CheckoutIntent['paymentMethod']
  payment_verification_state: 'NOT_VERIFIED' | 'VERIFIED' | null
  items: Array<{
    name: string
    category: 'ULAM' | 'DESSERTS' | 'EXTRAS'
    quantity: number
    unit_price_centavos: number
    item_subtotal_centavos: number
  }>
  food_subtotal_centavos: number
  base_delivery_charge_centavos: number
  far_area_charge_centavos: number
  customer_delivery_charge_centavos: number
  grand_total_centavos: number
  idempotent_replay: boolean
  guestToken: string
}

function randomBase64Url(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

export function createCheckoutAttempt(): CheckoutAttempt {
  return { idempotencyKey: createSecureUuid(), guestToken: randomBase64Url() }
}

export async function submitCheckout(
  intent: CheckoutIntent,
  attempt: CheckoutAttempt,
): Promise<CheckoutResult> {
  const result = await callPublicEdge<CheckoutResult>(
    'checkout',
    JSON.stringify({ ...intent, ...attempt }),
    'application/json',
  )
  saveGuestOrderSession({
    orderCode: result.order_code,
    guestToken: result.guestToken,
    expiresAt: result.guest_expires_at,
  })
  return result
}
