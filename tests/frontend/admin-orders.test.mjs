import assert from 'node:assert/strict'
import test from 'node:test'
import { adminModules } from '../../src/features/admin-auth/admin-modules.ts'
import {
  adminOrderQueryKeys,
  centavosToPesoInput,
  currentManilaBusinessDate,
  editDraftToTrustedInput,
  filterAdminOrders,
  orderToEditDraft,
  pesoInputToCentavos,
  paymentVerificationAction,
} from '../../src/features/admin-orders/model.ts'

const summaries = [
  {
    id: 'online',
    order_code: 'DV-ONLINE-42',
    source: 'ONLINE',
    customer_name: 'Maria Santos',
    payment_method: 'ONLINE_PAYMENT',
    payment_verification_state: 'NOT_VERIFIED',
    verified_at: null,
    grand_total_centavos: 14500,
    customer_delivery_charge_centavos: 2500,
    calculated_rider_centavos: 2500,
    is_cancelled: false,
    cancellation_reason: null,
    created_at: '2026-10-03T05:00:00Z',
    last_edited_at: '2026-10-03T05:00:00Z',
  },
  {
    id: 'manual',
    order_code: 'DV-MANUAL-09',
    source: 'MANUAL',
    customer_name: 'Jose Cruz',
    payment_method: 'CASH',
    payment_verification_state: null,
    verified_at: null,
    grand_total_centavos: 8000,
    customer_delivery_charge_centavos: 0,
    calculated_rider_centavos: 0,
    is_cancelled: true,
    cancellation_reason: 'Duplicate call',
    created_at: '2026-10-03T04:00:00Z',
    last_edited_at: '2026-10-03T04:00:00Z',
  },
]

test('enables the six implemented admin operations while Settings stays disabled', () => {
  assert.equal(adminModules.length, 7)
  assert.deepEqual(
    adminModules
      .filter((module) => module.enabled)
      .map((module) => [module.title, module.route]),
    [
      ['ULAM POST', '/admin/menu'],
      ['ULAM PHOTOS', '/admin/catalog'],
      ['MESSAGE', '/admin/messages'],
      ['ADDRESS BOOK', '/admin/address-book'],
      ['MANUAL ORDER', '/admin/manual-order'],
      ['TODAY’S ORDERS', '/admin/orders'],
    ],
  )
  assert.equal(adminModules.filter((module) => !module.enabled).length, 1)
})

test('derives the business date in Asia/Manila across a UTC date boundary', () => {
  assert.equal(
    currentManilaBusinessDate(new Date('2026-10-02T16:30:00Z')),
    '2026-10-03',
  )
})

test('searches mixed online/manual and active/cancelled orders by name or code', () => {
  assert.deepEqual(
    filterAdminOrders(summaries, 'maria').map((order) => order.id),
    ['online'],
  )
  assert.deepEqual(
    filterAdminOrders(summaries, 'manual-09').map((order) => order.id),
    ['manual'],
  )
  assert.deepEqual(filterAdminOrders(summaries, 'missing'), [])
  assert.equal(filterAdminOrders(summaries, '').length, 2)
})

test('offers verification only for online payment and supports reversal', () => {
  assert.equal(paymentVerificationAction(summaries[0]), 'verify')
  assert.equal(
    paymentVerificationAction({
      ...summaries[0],
      payment_verification_state: 'VERIFIED',
    }),
    'reverse',
  )
  assert.equal(paymentVerificationAction(summaries[1]), null)
})

test('keeps list, totals, and detail query identities separate for invalidation', () => {
  assert.deepEqual(adminOrderQueryKeys.list('2026-10-03'), [
    'admin-orders',
    '2026-10-03',
  ])
  assert.deepEqual(adminOrderQueryKeys.totals('2026-10-03'), [
    'admin-daily-totals',
    '2026-10-03',
  ])
  assert.deepEqual(adminOrderQueryKeys.detail('order-1'), [
    'admin-order',
    'order-1',
  ])
})

test('parses signed rider adjustments exactly to centavos', () => {
  assert.equal(pesoInputToCentavos(' +12.50 '), 1250)
  assert.equal(pesoInputToCentavos('-20'), -2000)
  assert.equal(pesoInputToCentavos('1,234.56'), 123456)
  assert.equal(pesoInputToCentavos('3.141'), null)
  assert.equal(centavosToPesoInput(-250), '-2.50')
})

test('maps complete order lines into trusted edit input without derived totals', () => {
  const detail = {
    ...summaries[0],
    exact_address: '10 Mabini Street',
    location_classification: 'NEARBY',
    selected_area_name: 'Poblacion',
    food_subtotal_centavos: 12000,
    internal_df_total_centavos: 1000,
    base_delivery_charge_centavos: 2500,
    far_area_charge_centavos: 0,
    cancelled_at: null,
    restored_at: null,
    delivery_threshold_centavos: 50000,
    base_charge_below_threshold_centavos: 2500,
    far_area_rate_centavos: 0,
    evidence: [],
    order_items: [
      {
        id: 'line-1',
        published_menu_item_id: 'published-1',
        catalog_item_id: 'catalog-1',
        name_snapshot: 'Adobo',
        category_snapshot: 'ULAM',
        quantity: 2,
        unit_price_centavos: 6000,
        internal_df_per_unit_centavos: 500,
        item_subtotal_centavos: 12000,
        internal_df_total_centavos: 1000,
        sort_order: 0,
      },
    ],
  }
  const input = editDraftToTrustedInput(detail.id, orderToEditDraft(detail))
  assert.equal(input.items[0].publishedMenuItemId, 'published-1')
  assert.equal(input.items[0].internalDfPerUnitCentavos, 500)
  assert.equal(input.items[0].unitPriceCentavos, 6000)
  assert.equal(input.deliveryThresholdCentavos, 50000)
  assert.equal(input.baseChargeBelowThresholdCentavos, 2500)
  assert.equal(input.farAreaRateCentavos, 0)
  assert.equal('grandTotalCentavos' in input, false)
  assert.equal('deliveryChargeCentavos' in input, false)
})

test('rejects invalid edit drafts before calling the trusted backend', () => {
  const draft = {
    customerName: 'Maria',
    exactAddress: 'Address',
    locationClassification: 'NEARBY',
    selectedAreaName: '',
    paymentMethod: 'CASH',
    deliveryThresholdPesos: '20.00',
    baseChargeBelowThresholdPesos: '15.00',
    farAreaRatePesos: '20.00',
    items: [
      {
        id: '1',
        publishedMenuItemId: null,
        catalogItemId: null,
        name: 'Rice',
        category: 'EXTRAS',
        quantity: 0,
        unitPricePesos: '-1',
        internalDfPesos: '0',
      },
    ],
  }
  assert.equal(editDraftToTrustedInput('order', draft), null)
})
