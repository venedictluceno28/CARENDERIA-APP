import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateManualOrderPreview,
  catalogItemToManualDraft,
  manualOrderDraftToInput,
  manualOrderQueryKey,
  manualOrderSettingsQueryKey,
} from '../../src/features/admin-manual-order/model.ts'

const settings = {
  deliveryThresholdCentavos: 2_000,
  baseChargeCentavos: 1_500,
  farAreaChargeCentavos: 2_000,
}

function draft(overrides = {}) {
  return {
    customerName: '  María Dela Cruz  ',
    exactAddress: '  14 Sampaguita Street, Block 2  ',
    deliveryArea: 'Marycris Complex',
    paymentMethod: 'CASH',
    items: [
      {
        key: 'local-only-key',
        catalogItemId: null,
        name: '  Special order  ',
        category: 'EXTRAS',
        quantity: 2,
        unitPricePesos: '75.50',
        internalDfPesos: '5.00',
      },
    ],
    ...overrides,
  }
}

test('keeps catalog and delivery-settings query identities separate', () => {
  assert.deepEqual(manualOrderQueryKey, ['admin-manual-order', 'catalog'])
  assert.deepEqual(manualOrderSettingsQueryKey, [
    'admin-manual-order',
    'settings',
  ])
})

test('pre-fills an editable manual row from an active catalog item', () => {
  const row = catalogItemToManualDraft({
    id: 'catalog-adobo',
    name: 'Chicken Adobo',
    category: 'ULAM',
    priceCentavos: 8_550,
    internalDfCentavos: 975,
  })
  assert.equal(row.catalogItemId, 'catalog-adobo')
  assert.equal(row.name, 'Chicken Adobo')
  assert.equal(row.category, 'ULAM')
  assert.equal(row.quantity, 1)
  assert.equal(row.unitPricePesos, '85.50')
  assert.equal(row.internalDfPesos, '9.75')
})

test('maps a free-form nearby order to the exact trusted RPC input', () => {
  const input = manualOrderDraftToInput(draft())
  assert.deepEqual(input, {
    customerName: 'María Dela Cruz',
    exactAddress: '14 Sampaguita Street, Block 2',
    locationClassification: 'NEARBY',
    selectedAreaName: 'Marycris Complex',
    paymentMethod: 'CASH',
    items: [
      {
        name: 'Special order',
        category: 'EXTRAS',
        quantity: 2,
        unitPriceCentavos: 7_550,
        internalDfPerUnitCentavos: 500,
      },
    ],
  })
  assert.equal('guestToken' in input, false)
  assert.equal('grandTotalCentavos' in input, false)
  assert.equal('catalogItemId' in input.items[0], false)
})

test('maps outside-area and online-payment choices without a guest session', () => {
  const input = manualOrderDraftToInput(
    draft({ deliveryArea: 'OUTSIDE', paymentMethod: 'ONLINE_PAYMENT' }),
  )
  assert.equal(input.locationClassification, 'OUTSIDE')
  assert.equal(input.selectedAreaName, null)
  assert.equal(input.paymentMethod, 'ONLINE_PAYMENT')
})

test('rejects incomplete customer, location, item, and unsafe money drafts', () => {
  assert.equal(manualOrderDraftToInput(draft({ customerName: ' ' })), null)
  assert.equal(manualOrderDraftToInput(draft({ exactAddress: '' })), null)
  assert.equal(manualOrderDraftToInput(draft({ deliveryArea: '' })), null)
  assert.equal(manualOrderDraftToInput(draft({ items: [] })), null)
  assert.equal(
    manualOrderDraftToInput(
      draft({ items: [{ ...draft().items[0], quantity: 1.5 }] }),
    ),
    null,
  )
  assert.equal(
    manualOrderDraftToInput(
      draft({ items: [{ ...draft().items[0], unitPricePesos: '1.001' }] }),
    ),
    null,
  )
  assert.equal(
    manualOrderDraftToInput(
      draft({ items: [{ ...draft().items[0], internalDfPesos: '-1' }] }),
    ),
    null,
  )
})

test('previews nearby below-threshold delivery and rider totals', () => {
  const input = manualOrderDraftToInput(
    draft({
      items: [{ ...draft().items[0], quantity: 1, internalDfPesos: '5.00' }],
    }),
  )
  assert.deepEqual(calculateManualOrderPreview(input, settings), {
    foodSubtotalCentavos: 7_550,
    internalDfTotalCentavos: 500,
    baseDeliveryChargeCentavos: 1_500,
    farAreaChargeCentavos: 0,
    customerDeliveryChargeCentavos: 1_500,
    grandTotalCentavos: 9_050,
    calculatedRiderCentavos: 2_000,
  })
})

test('previews all threshold and area delivery combinations', () => {
  const cases = [
    ['Marycris Complex', '5.00', 1_500, 0, 2_000],
    ['Marycris Complex', '20.00', 0, 0, 2_000],
    ['OUTSIDE', '5.00', 1_500, 2_000, 4_000],
    ['OUTSIDE', '20.00', 0, 2_000, 4_000],
  ]
  for (const [deliveryArea, internalDfPesos, base, far, rider] of cases) {
    const input = manualOrderDraftToInput(
      draft({
        deliveryArea,
        items: [
          {
            ...draft().items[0],
            quantity: 1,
            internalDfPesos,
          },
        ],
      }),
    )
    const preview = calculateManualOrderPreview(input, settings)
    assert.equal(preview.baseDeliveryChargeCentavos, base)
    assert.equal(preview.farAreaChargeCentavos, far)
    assert.equal(preview.calculatedRiderCentavos, rider)
  }
})
