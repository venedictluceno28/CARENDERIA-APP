import {
  centavosToPesoInput,
  pesoInputToCentavos,
} from '../../lib/money-input.ts'
import { createSecureUuid } from '../../lib/secure-random-uuid.ts'
import type {
  ManualOrderCatalogItem,
  ManualOrderDraft,
  ManualOrderInput,
  ManualOrderItemDraft,
  ManualOrderPreview,
  ManualOrderSettings,
} from './types.ts'

export const manualOrderQueryKey = ['admin-manual-order', 'catalog'] as const
export const manualOrderSettingsQueryKey = [
  'admin-manual-order',
  'settings',
] as const

export function savedAddressToManualCustomer(entry: {
  customerName: string
  exactAddress: string
}) {
  return {
    customerName: entry.customerName,
    exactAddress: entry.exactAddress,
  }
}

export function emptyManualItem(): ManualOrderItemDraft {
  return {
    key: createSecureUuid(),
    catalogItemId: null,
    name: '',
    category: 'ULAM',
    quantity: 1,
    unitPricePesos: '',
    internalDfPesos: '',
  }
}

export function catalogItemToManualDraft(
  item: ManualOrderCatalogItem,
): ManualOrderItemDraft {
  return {
    key: createSecureUuid(),
    catalogItemId: item.id,
    name: item.name,
    category: item.category,
    quantity: 1,
    unitPricePesos: centavosToPesoInput(item.priceCentavos),
    internalDfPesos: centavosToPesoInput(item.internalDfCentavos),
  }
}

export function manualOrderDraftToInput(
  draft: ManualOrderDraft,
): ManualOrderInput | null {
  const customerName = draft.customerName.trim()
  const exactAddress = draft.exactAddress.trim()
  if (
    !customerName ||
    customerName.length > 160 ||
    !exactAddress ||
    exactAddress.length > 1000 ||
    !draft.deliveryArea ||
    !draft.items.length ||
    draft.items.length > 50
  )
    return null

  const items = draft.items.map((item) => ({
    name: item.name.trim(),
    category: item.category,
    quantity: Number(item.quantity),
    unitPriceCentavos: pesoInputToCentavos(item.unitPricePesos),
    internalDfPerUnitCentavos: pesoInputToCentavos(item.internalDfPesos),
  }))
  if (
    items.some(
      (item) =>
        !item.name ||
        item.name.length > 160 ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > 2_147_483_647 ||
        item.unitPriceCentavos === null ||
        item.unitPriceCentavos < 0 ||
        item.internalDfPerUnitCentavos === null ||
        item.internalDfPerUnitCentavos < 0,
    )
  )
    return null

  return {
    customerName,
    exactAddress,
    locationClassification:
      draft.deliveryArea === 'OUTSIDE' ? 'OUTSIDE' : 'NEARBY',
    selectedAreaName:
      draft.deliveryArea === 'OUTSIDE' ? null : draft.deliveryArea,
    paymentMethod: draft.paymentMethod,
    items: items.map((item) => ({
      ...item,
      unitPriceCentavos: item.unitPriceCentavos as number,
      internalDfPerUnitCentavos: item.internalDfPerUnitCentavos as number,
    })),
  }
}

export function calculateManualOrderPreview(
  input: ManualOrderInput,
  settings: ManualOrderSettings,
): ManualOrderPreview | null {
  const foodSubtotalCentavos = input.items.reduce(
    (total, item) => total + item.quantity * item.unitPriceCentavos,
    0,
  )
  const internalDfTotalCentavos = input.items.reduce(
    (total, item) => total + item.quantity * item.internalDfPerUnitCentavos,
    0,
  )
  if (
    !Number.isSafeInteger(foodSubtotalCentavos) ||
    !Number.isSafeInteger(internalDfTotalCentavos)
  )
    return null
  const baseDeliveryChargeCentavos =
    internalDfTotalCentavos >= settings.deliveryThresholdCentavos
      ? 0
      : settings.baseChargeCentavos
  const farAreaChargeCentavos =
    input.locationClassification === 'OUTSIDE'
      ? settings.farAreaChargeCentavos
      : 0
  const customerDeliveryChargeCentavos =
    baseDeliveryChargeCentavos + farAreaChargeCentavos
  return {
    foodSubtotalCentavos,
    internalDfTotalCentavos,
    baseDeliveryChargeCentavos,
    farAreaChargeCentavos,
    customerDeliveryChargeCentavos,
    grandTotalCentavos: foodSubtotalCentavos + customerDeliveryChargeCentavos,
    calculatedRiderCentavos:
      internalDfTotalCentavos + customerDeliveryChargeCentavos,
  }
}
