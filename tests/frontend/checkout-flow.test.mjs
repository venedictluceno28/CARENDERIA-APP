import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCheckoutIntent,
  checkoutAttemptForIntent,
  checkoutIntentSignature,
  parsePriceConflicts,
  parseUnavailableItemIds,
  validateCheckoutDraft,
} from '../../src/features/customer-ordering/checkout/checkout-flow.ts'
import {
  applyPriceConflicts,
  cartHasBlockingChanges,
  markCartItemsUnavailable,
} from '../../src/features/customer-ordering/cart.ts'
import {
  receiptDisplayModel,
  receiptPaymentStatus,
} from '../../src/features/customer-ordering/checkout/receipt-model.ts'

const cart = {
  version: 1,
  menuId: '11111111-1111-4111-8111-111111111111',
  items: [
    {
      publishedMenuItemId: '21111111-1111-4111-8111-111111111111',
      name: 'Chicken Adobo',
      imagePath: '/adobo.jpg',
      category: 'ULAM',
      reviewedUnitPriceCentavos: 8500,
      quantity: 2,
      availability: 'available',
    },
  ],
}

const validDraft = {
  customerName: '  María Dela Cruz-Santos  ',
  exactAddress: '  Block 1 Lot 2, near the covered court  ',
  deliveryArea: 'Marycris Complex',
  paymentMethod: 'CASH',
}

test('checkout form validation requires name, address, area, and payment', () => {
  assert.deepEqual(
    Object.keys(
      validateCheckoutDraft({
        customerName: '   ',
        exactAddress: '',
        deliveryArea: '',
        paymentMethod: '',
      }),
    ).sort(),
    ['customerName', 'deliveryArea', 'exactAddress', 'paymentMethod'],
  )
  assert.deepEqual(validateCheckoutDraft(validDraft), {})
})

test('checkout request contains only intent and reviewed cart lines', () => {
  const intent = buildCheckoutIntent(cart, validDraft)
  assert.deepEqual(intent, {
    publishedMenuId: cart.menuId,
    items: [
      {
        publishedMenuItemId: cart.items[0].publishedMenuItemId,
        quantity: 2,
        expectedUnitPriceCentavos: 8500,
      },
    ],
    customerName: 'María Dela Cruz-Santos',
    exactAddress: 'Block 1 Lot 2, near the covered court',
    locationClassification: 'NEARBY',
    selectedAreaName: 'Marycris Complex',
    paymentMethod: 'CASH',
  })
  const serialized = JSON.stringify(intent)
  assert.equal(serialized.includes('internal'), false)
  assert.equal(serialized.includes('rider'), false)
  assert.equal(serialized.includes('deliveryCharge'), false)
  assert.equal(serialized.includes('grandTotal'), false)
})

test('outside selection maps to the exact backend location contract', () => {
  const intent = buildCheckoutIntent(cart, {
    ...validDraft,
    deliveryArea: 'OUTSIDE',
    paymentMethod: 'ONLINE_PAYMENT',
  })
  assert.equal(intent.locationClassification, 'OUTSIDE')
  assert.equal(intent.selectedAreaName, null)
  assert.equal(intent.paymentMethod, 'ONLINE_PAYMENT')
})

test('equivalent intents have a stable signature despite cart-line order', () => {
  const first = buildCheckoutIntent(cart, validDraft)
  const second = {
    ...first,
    items: [
      {
        publishedMenuItemId: '31111111-1111-4111-8111-111111111111',
        quantity: 1,
        expectedUnitPriceCentavos: 4500,
      },
      ...first.items,
    ],
  }
  assert.equal(
    checkoutIntentSignature(second),
    checkoutIntentSignature({ ...second, items: [...second.items].reverse() }),
  )
})

test('same-intent retry reuses one idempotency key and guest token', () => {
  let created = 0
  const factory = () => ({
    idempotencyKey: `attempt-${++created}`,
    guestToken: `token-${created}`,
  })
  const intent = buildCheckoutIntent(cart, validDraft)
  const first = checkoutAttemptForIntent(null, intent, factory)
  const duplicateClick = checkoutAttemptForIntent(first, intent, factory)
  const uncertainRetry = checkoutAttemptForIntent(
    duplicateClick,
    intent,
    factory,
  )
  assert.equal(created, 1)
  assert.strictEqual(duplicateClick, first)
  assert.strictEqual(uncertainRetry, first)
})

test('meaningfully changed checkout intent receives a new attempt', () => {
  let created = 0
  const factory = () => ({
    idempotencyKey: `attempt-${++created}`,
    guestToken: `token-${created}`,
  })
  const firstIntent = buildCheckoutIntent(cart, validDraft)
  const first = checkoutAttemptForIntent(null, firstIntent, factory)
  const changedIntent = buildCheckoutIntent(cart, {
    ...validDraft,
    exactAddress: 'A different delivery address',
  })
  const changed = checkoutAttemptForIntent(first, changedIntent, factory)
  assert.equal(created, 2)
  assert.notEqual(changed.attempt.idempotencyKey, first.attempt.idempotencyKey)
})

test('PRICE_CHANGED details are parsed and require explicit cart review', () => {
  const conflicts = parsePriceConflicts([
    {
      published_menu_item_id: cart.items[0].publishedMenuItemId,
      current_unit_price_centavos: 9000,
      expected_unit_price_centavos: 8500,
      name: 'Chicken Adobo',
    },
  ])
  const reconciled = applyPriceConflicts(cart, conflicts)
  assert.deepEqual(conflicts, [
    {
      publishedMenuItemId: cart.items[0].publishedMenuItemId,
      currentUnitPriceCentavos: 9000,
    },
  ])
  assert.equal(reconciled.items[0].reviewedUnitPriceCentavos, 8500)
  assert.equal(reconciled.items[0].pendingUnitPriceCentavos, 9000)
  assert.equal(cartHasBlockingChanges(reconciled), true)
})

test('ITEM_SOLD_OUT details mark only affected lines unavailable', () => {
  const ids = parseUnavailableItemIds([
    {
      published_menu_item_id: cart.items[0].publishedMenuItemId,
      name: 'Chicken Adobo',
    },
  ])
  const reconciled = markCartItemsUnavailable(cart, ids)
  assert.deepEqual(ids, [cart.items[0].publishedMenuItemId])
  assert.equal(reconciled.items[0].availability, 'sold-out')
  assert.equal(cartHasBlockingChanges(reconciled), true)
})

test('malformed safe conflict details are ignored defensively', () => {
  assert.deepEqual(parsePriceConflicts({ nope: true }), [])
  assert.deepEqual(
    parsePriceConflicts([{ current_unit_price_centavos: -1 }]),
    [],
  )
  assert.deepEqual(parseUnavailableItemIds(null), [])
})

const receipt = {
  order_code: 'CRD-AB12CD34EF',
  customer_name: 'Fake Local Customer',
  exact_address: 'Fake local address',
  location_classification: 'NEARBY',
  selected_area_name: 'Marycris Complex',
  payment_method: 'ONLINE_PAYMENT',
  payment_verification_state: 'NOT_VERIFIED',
  food_subtotal_centavos: 17000,
  customer_delivery_charge_centavos: 0,
  grand_total_centavos: 17000,
  is_cancelled: false,
  created_at: '2026-10-03T00:00:00Z',
  guest_expires_at: '2026-10-04T00:00:00Z',
  items: [
    {
      name: 'Chicken Adobo',
      category: 'ULAM',
      quantity: 2,
      unit_price_centavos: 8500,
      item_subtotal_centavos: 17000,
    },
  ],
}

test('authoritative receipt model preserves order code, lines, and totals', () => {
  const model = receiptDisplayModel(receipt)
  assert.equal(model.orderCode, 'CRD-AB12CD34EF')
  assert.equal(model.items[0].quantity, 2)
  assert.equal(model.items[0].unitPriceCentavos, 8500)
  assert.equal(model.foodSubtotalCentavos, 17000)
  assert.equal(model.deliveryChargeCentavos, 0)
  assert.equal(model.grandTotalCentavos, 17000)
  assert.equal(JSON.stringify(model).includes('internal'), false)
  assert.equal(JSON.stringify(model).includes('rider'), false)
})

test('online payment shows Not Verified while cash has no verification state', () => {
  assert.equal(receiptPaymentStatus(receipt), 'Not Verified')
  assert.equal(
    receiptPaymentStatus({
      payment_method: 'ONLINE_PAYMENT',
      payment_verification_state: 'VERIFIED',
    }),
    'Verified',
  )
  assert.equal(
    receiptPaymentStatus({
      payment_method: 'CASH',
      payment_verification_state: null,
    }),
    null,
  )
})
