import type { DeliveryArea } from '../../lib/delivery-areas.ts'
import type { MenuCategory } from '../../lib/menu-category.ts'

export type ManualOrderCatalogItem = {
  id: string
  name: string
  category: MenuCategory
  priceCentavos: number
  internalDfCentavos: number
}

export type ManualOrderItemDraft = {
  key: string
  catalogItemId: string | null
  name: string
  category: MenuCategory
  quantity: number
  unitPricePesos: string
  internalDfPesos: string
}

export type ManualOrderDraft = {
  customerName: string
  exactAddress: string
  deliveryArea: DeliveryArea | ''
  paymentMethod: 'CASH' | 'ONLINE_PAYMENT'
  items: ManualOrderItemDraft[]
}

export type ManualOrderInput = {
  customerName: string
  exactAddress: string
  locationClassification: 'NEARBY' | 'OUTSIDE'
  selectedAreaName: string | null
  paymentMethod: 'CASH' | 'ONLINE_PAYMENT'
  items: Array<{
    name: string
    category: MenuCategory
    quantity: number
    unitPriceCentavos: number
    internalDfPerUnitCentavos: number
  }>
}

export type ManualOrderSettings = {
  deliveryThresholdCentavos: number
  baseChargeCentavos: number
  farAreaChargeCentavos: number
}

export type ManualOrderPreview = {
  foodSubtotalCentavos: number
  internalDfTotalCentavos: number
  baseDeliveryChargeCentavos: number
  farAreaChargeCentavos: number
  customerDeliveryChargeCentavos: number
  grandTotalCentavos: number
  calculatedRiderCentavos: number
}

export type ManualOrderResult = {
  orderId: string
  orderCode: string
  createdAt: string
  grandTotalCentavos: number
  calculatedRiderCentavos: number
}
