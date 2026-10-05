import type { MenuCategory } from '../../lib/menu-category.ts'
import type { DeliveryArea } from '../../lib/delivery-areas.ts'

export { MENU_CATEGORIES } from '../../lib/menu-category.ts'
export type { MenuCategory } from '../../lib/menu-category.ts'
export { NEARBY_AREAS } from '../../lib/delivery-areas.ts'
export type { DeliveryArea, NearbyArea } from '../../lib/delivery-areas.ts'

export type PublishedMenuItem = {
  id: string
  publishedMenuId: string
  name: string
  category: MenuCategory
  unitPriceCentavos: number
  imagePath: string
  isSoldOut: boolean
  sortOrder: number
}

export type PublishedMenu = {
  id: string
  imagePath: string
  activatedAt: string
  expiresAt: string
  items: PublishedMenuItem[]
}

export type CartItemAvailability = 'available' | 'sold-out' | 'removed'

export type CartItem = {
  publishedMenuItemId: string
  name: string
  imagePath: string
  category: MenuCategory
  reviewedUnitPriceCentavos: number
  pendingUnitPriceCentavos?: number
  quantity: number
  availability: CartItemAvailability
}

export type CartState = {
  version: 1
  menuId: string | null
  items: CartItem[]
}

export type PaymentMethod = 'CASH' | 'ONLINE_PAYMENT'

export type CheckoutDraft = {
  customerName: string
  exactAddress: string
  deliveryArea: DeliveryArea | ''
  paymentMethod: PaymentMethod | ''
}

export type MenuLoadState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'success'; menu: PublishedMenu | null; refresh: () => void }
