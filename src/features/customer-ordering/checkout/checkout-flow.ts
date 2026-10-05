import type {
  CheckoutAttempt,
  CheckoutIntent,
} from '../../../lib/api/checkout.ts'
import type { PriceConflict } from '../cart.ts'
import type { CartState, CheckoutDraft } from '../types.ts'
import { NEARBY_AREAS } from '../types.ts'

export type CheckoutDraftErrors = Partial<Record<keyof CheckoutDraft, string>>

export function validateCheckoutDraft(
  draft: CheckoutDraft,
): CheckoutDraftErrors {
  const errors: CheckoutDraftErrors = {}
  const name = draft.customerName.trim()
  const address = draft.exactAddress.trim()
  if (!name) errors.customerName = 'Enter the customer name.'
  else if (name.length > 160)
    errors.customerName = 'Keep the customer name under 160 characters.'
  if (!address) errors.exactAddress = 'Enter the exact delivery address.'
  else if (address.length > 1000)
    errors.exactAddress = 'Keep the address under 1,000 characters.'
  if (
    draft.deliveryArea !== 'OUTSIDE' &&
    !NEARBY_AREAS.includes(draft.deliveryArea as (typeof NEARBY_AREAS)[number])
  ) {
    errors.deliveryArea = 'Choose a delivery area.'
  }
  if (
    draft.paymentMethod !== 'CASH' &&
    draft.paymentMethod !== 'ONLINE_PAYMENT'
  ) {
    errors.paymentMethod = 'Choose a payment method.'
  }
  return errors
}

export function buildCheckoutIntent(
  cart: CartState,
  draft: CheckoutDraft,
): CheckoutIntent {
  if (
    !cart.menuId ||
    !cart.items.length ||
    Object.keys(validateCheckoutDraft(draft)).length
  ) {
    throw new Error('INVALID_CHECKOUT_INTENT')
  }
  const nearby = draft.deliveryArea !== 'OUTSIDE'
  return {
    publishedMenuId: cart.menuId,
    items: cart.items.map((item) => ({
      publishedMenuItemId: item.publishedMenuItemId,
      quantity: item.quantity,
      expectedUnitPriceCentavos: item.reviewedUnitPriceCentavos,
    })),
    customerName: draft.customerName.trim(),
    exactAddress: draft.exactAddress.trim(),
    locationClassification: nearby ? 'NEARBY' : 'OUTSIDE',
    selectedAreaName: nearby ? draft.deliveryArea : null,
    paymentMethod: draft.paymentMethod as 'CASH' | 'ONLINE_PAYMENT',
  }
}

export function checkoutIntentSignature(intent: CheckoutIntent): string {
  return JSON.stringify({
    ...intent,
    items: [...intent.items].sort((a, b) =>
      a.publishedMenuItemId.localeCompare(b.publishedMenuItemId),
    ),
  })
}

export type PendingCheckoutAttempt = {
  signature: string
  attempt: CheckoutAttempt
}

export function checkoutAttemptForIntent(
  current: PendingCheckoutAttempt | null,
  intent: CheckoutIntent,
  createAttempt: () => CheckoutAttempt,
): PendingCheckoutAttempt {
  const signature = checkoutIntentSignature(intent)
  return current?.signature === signature
    ? current
    : { signature, attempt: createAttempt() }
}

export function parsePriceConflicts(details: unknown): PriceConflict[] {
  if (!Array.isArray(details)) return []
  return details.flatMap((value) => {
    if (!isRecord(value)) return []
    const id = value.published_menu_item_id
    const price = Number(value.current_unit_price_centavos)
    return typeof id === 'string' && Number.isSafeInteger(price) && price >= 0
      ? [{ publishedMenuItemId: id, currentUnitPriceCentavos: price }]
      : []
  })
}

export function parseUnavailableItemIds(details: unknown): string[] {
  if (!Array.isArray(details)) return []
  return details.flatMap((value) =>
    isRecord(value) && typeof value.published_menu_item_id === 'string'
      ? [value.published_menu_item_id]
      : [],
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
