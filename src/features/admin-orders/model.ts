import type {
  AdminEditOrderInput,
  AdminOrderDetail,
  AdminOrderSummary,
} from '../../lib/api/admin-operations.ts'
import {
  centavosToPesoInput,
  pesoInputToCentavos,
} from '../../lib/money-input.ts'
import {
  adminOrderQueryKeys,
  currentManilaBusinessDate,
} from '../../lib/admin-order-queries.ts'

export { centavosToPesoInput, pesoInputToCentavos }
export { adminOrderQueryKeys, currentManilaBusinessDate }

export function paymentVerificationAction(
  order: Pick<
    AdminOrderSummary,
    'payment_method' | 'payment_verification_state'
  >,
): 'verify' | 'reverse' | null {
  if (order.payment_method === 'CASH') return null
  return order.payment_verification_state === 'VERIFIED' ? 'reverse' : 'verify'
}

export function filterAdminOrders(
  orders: AdminOrderSummary[],
  search: string,
): AdminOrderSummary[] {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return orders
  return orders.filter(
    (order) =>
      order.customer_name.toLocaleLowerCase().includes(query) ||
      order.order_code.toLocaleLowerCase().includes(query),
  )
}

export type AdminOrderEditDraft = {
  customerName: string
  exactAddress: string
  locationClassification: 'NEARBY' | 'OUTSIDE'
  selectedAreaName: string
  paymentMethod: 'CASH' | 'ONLINE_PAYMENT'
  deliveryThresholdPesos: string
  baseChargeBelowThresholdPesos: string
  farAreaRatePesos: string
  items: Array<{
    id: string
    publishedMenuItemId: string | null
    catalogItemId: string | null
    name: string
    category: 'ULAM' | 'DESSERTS' | 'EXTRAS'
    quantity: number
    unitPricePesos: string
    internalDfPesos: string
  }>
}

export function orderToEditDraft(order: AdminOrderDetail): AdminOrderEditDraft {
  return {
    customerName: order.customer_name,
    exactAddress: order.exact_address,
    locationClassification: order.location_classification,
    selectedAreaName: order.selected_area_name ?? '',
    paymentMethod: order.payment_method,
    deliveryThresholdPesos: centavosToPesoInput(
      order.delivery_threshold_centavos,
    ),
    baseChargeBelowThresholdPesos: centavosToPesoInput(
      order.base_charge_below_threshold_centavos,
    ),
    farAreaRatePesos: centavosToPesoInput(order.far_area_rate_centavos),
    items: order.order_items.map((item) => ({
      id: item.id,
      publishedMenuItemId: item.published_menu_item_id,
      catalogItemId: item.catalog_item_id,
      name: item.name_snapshot,
      category: item.category_snapshot,
      quantity: item.quantity,
      unitPricePesos: centavosToPesoInput(item.unit_price_centavos),
      internalDfPesos: centavosToPesoInput(item.internal_df_per_unit_centavos),
    })),
  }
}

export function editDraftToTrustedInput(
  orderId: string,
  draft: AdminOrderEditDraft,
): AdminEditOrderInput | null {
  const deliveryThresholdCentavos = pesoInputToCentavos(
    draft.deliveryThresholdPesos,
  )
  const baseChargeBelowThresholdCentavos = pesoInputToCentavos(
    draft.baseChargeBelowThresholdPesos,
  )
  const farAreaRateCentavos = pesoInputToCentavos(draft.farAreaRatePesos)
  const items = draft.items.map((item) => ({
    publishedMenuItemId: item.publishedMenuItemId,
    catalogItemId: item.catalogItemId,
    name: item.name.trim(),
    category: item.category,
    quantity: Number(item.quantity),
    unitPriceCentavos: pesoInputToCentavos(item.unitPricePesos),
    internalDfPerUnitCentavos: pesoInputToCentavos(item.internalDfPesos),
  }))
  if (
    !draft.customerName.trim() ||
    !draft.exactAddress.trim() ||
    !items.length ||
    items.some(
      (item) =>
        !item.name ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.unitPriceCentavos === null ||
        item.unitPriceCentavos < 0 ||
        item.internalDfPerUnitCentavos === null ||
        item.internalDfPerUnitCentavos < 0,
    ) ||
    (draft.locationClassification === 'NEARBY' &&
      !draft.selectedAreaName.trim()) ||
    deliveryThresholdCentavos === null ||
    deliveryThresholdCentavos < 0 ||
    baseChargeBelowThresholdCentavos === null ||
    baseChargeBelowThresholdCentavos < 0 ||
    farAreaRateCentavos === null ||
    farAreaRateCentavos < 0
  )
    return null
  return {
    orderId,
    customerName: draft.customerName.trim(),
    exactAddress: draft.exactAddress.trim(),
    locationClassification: draft.locationClassification,
    selectedAreaName:
      draft.locationClassification === 'NEARBY'
        ? draft.selectedAreaName.trim()
        : null,
    paymentMethod: draft.paymentMethod,
    deliveryThresholdCentavos,
    baseChargeBelowThresholdCentavos,
    farAreaRateCentavos,
    items: items.map((item) => ({
      ...item,
      unitPriceCentavos: item.unitPriceCentavos as number,
      internalDfPerUnitCentavos: item.internalDfPerUnitCentavos as number,
    })),
  }
}
