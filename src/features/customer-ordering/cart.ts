import {
  MENU_CATEGORIES,
  type CartItem,
  type CartState,
  type PublishedMenu,
  type PublishedMenuItem,
} from './types.ts'

export const CART_STORAGE_KEY = 'tindahan.customer-cart.v1'
const MAX_POSTGRES_INTEGER = 2_147_483_647

export function emptyCart(): CartState {
  return { version: 1, menuId: null, items: [] }
}

export function addMenuItem(
  cart: CartState,
  menu: PublishedMenu,
  item: PublishedMenuItem,
): CartState {
  if (item.isSoldOut || item.publishedMenuId !== menu.id) return cart

  const base = cart.menuId === menu.id ? cart : emptyCart()
  const existing = base.items.find(
    (line) => line.publishedMenuItemId === item.id,
  )
  if (existing) {
    if (existing.quantity >= MAX_POSTGRES_INTEGER) return base
    return {
      ...base,
      items: base.items.map((line) =>
        line.publishedMenuItemId === item.id
          ? { ...line, quantity: line.quantity + 1 }
          : line,
      ),
    }
  }

  return {
    version: 1,
    menuId: menu.id,
    items: [
      ...base.items,
      {
        publishedMenuItemId: item.id,
        name: item.name,
        imagePath: item.imagePath,
        category: item.category,
        reviewedUnitPriceCentavos: item.unitPriceCentavos,
        quantity: 1,
        availability: 'available',
      },
    ],
  }
}

export function setCartItemQuantity(
  cart: CartState,
  publishedMenuItemId: string,
  quantity: number,
): CartState {
  if (!Number.isSafeInteger(quantity) || quantity > MAX_POSTGRES_INTEGER)
    return cart
  if (quantity < 1) return removeCartItem(cart, publishedMenuItemId)
  return {
    ...cart,
    items: cart.items.map((item) =>
      item.publishedMenuItemId === publishedMenuItemId
        ? { ...item, quantity }
        : item,
    ),
  }
}

export function removeCartItem(
  cart: CartState,
  publishedMenuItemId: string,
): CartState {
  const items = cart.items.filter(
    (item) => item.publishedMenuItemId !== publishedMenuItemId,
  )
  return items.length ? { ...cart, items } : emptyCart()
}

export function cartItemCount(cart: CartState): number {
  return cart.items.reduce((total, item) => total + item.quantity, 0)
}

export function cartSubtotal(cart: CartState): number {
  return cart.items.reduce(
    (total, item) => total + item.reviewedUnitPriceCentavos * item.quantity,
    0,
  )
}

export function cartHasBlockingChanges(cart: CartState): boolean {
  return cart.items.some(
    (item) =>
      item.availability !== 'available' ||
      item.pendingUnitPriceCentavos !== undefined,
  )
}

export type ReconciliationEvent =
  'none' | 'menu-cleared' | 'availability-changed' | 'price-changed'

export function reconcileCart(
  cart: CartState,
  menu: PublishedMenu | null,
): { cart: CartState; event: ReconciliationEvent } {
  if (!cart.items.length) return { cart, event: 'none' }
  if (!menu || cart.menuId !== menu.id) {
    return { cart: emptyCart(), event: 'menu-cleared' }
  }

  let availabilityChanged = false
  let priceChanged = false
  const items = cart.items.map((line) => {
    const current = menu.items.find(
      (item) => item.id === line.publishedMenuItemId,
    )
    const availability = !current
      ? 'removed'
      : current.isSoldOut
        ? 'sold-out'
        : 'available'
    if (availability !== line.availability && availability !== 'available') {
      availabilityChanged = true
    }

    const pendingUnitPriceCentavos =
      current && current.unitPriceCentavos !== line.reviewedUnitPriceCentavos
        ? current.unitPriceCentavos
        : undefined
    if (
      pendingUnitPriceCentavos !== undefined &&
      pendingUnitPriceCentavos !== line.pendingUnitPriceCentavos
    ) {
      priceChanged = true
    }

    return {
      ...line,
      availability,
      pendingUnitPriceCentavos,
    } satisfies CartItem
  })

  return {
    cart: { ...cart, items },
    event: priceChanged
      ? 'price-changed'
      : availabilityChanged
        ? 'availability-changed'
        : 'none',
  }
}

export function acceptCurrentPrices(cart: CartState): CartState {
  return {
    ...cart,
    items: cart.items.map((item) =>
      item.pendingUnitPriceCentavos === undefined
        ? item
        : {
            ...item,
            reviewedUnitPriceCentavos: item.pendingUnitPriceCentavos,
            pendingUnitPriceCentavos: undefined,
          },
    ),
  }
}

export type PriceConflict = {
  publishedMenuItemId: string
  currentUnitPriceCentavos: number
}

export function applyPriceConflicts(
  cart: CartState,
  conflicts: PriceConflict[],
): CartState {
  const prices = new Map(
    conflicts.map((conflict) => [
      conflict.publishedMenuItemId,
      conflict.currentUnitPriceCentavos,
    ]),
  )
  return {
    ...cart,
    items: cart.items.map((item) => {
      const currentPrice = prices.get(item.publishedMenuItemId)
      return currentPrice === undefined ||
        !Number.isSafeInteger(currentPrice) ||
        currentPrice < 0 ||
        currentPrice === item.reviewedUnitPriceCentavos
        ? item
        : { ...item, pendingUnitPriceCentavos: currentPrice }
    }),
  }
}

export function markCartItemsUnavailable(
  cart: CartState,
  publishedMenuItemIds: string[],
): CartState {
  const ids = new Set(publishedMenuItemIds)
  return {
    ...cart,
    items: cart.items.map((item) =>
      ids.has(item.publishedMenuItemId)
        ? { ...item, availability: 'sold-out' }
        : item,
    ),
  }
}

export function parsePersistedCart(raw: string | null): CartState {
  if (!raw) return emptyCart()
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || value.version !== 1) return emptyCart()
    if (typeof value.menuId !== 'string' || !Array.isArray(value.items))
      return emptyCart()

    const ids = new Set<string>()
    const items: CartItem[] = []
    for (const item of value.items) {
      if (!isValidCartItem(item) || ids.has(item.publishedMenuItemId))
        return emptyCart()
      ids.add(item.publishedMenuItemId)
      items.push(item)
    }
    if (!items.length) return emptyCart()
    return { version: 1, menuId: value.menuId, items }
  } catch {
    return emptyCart()
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidCartItem(value: unknown): value is CartItem {
  if (!isRecord(value)) return false
  return (
    typeof value.publishedMenuItemId === 'string' &&
    value.publishedMenuItemId.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= 160 &&
    typeof value.imagePath === 'string' &&
    MENU_CATEGORIES.includes(
      value.category as (typeof MENU_CATEGORIES)[number],
    ) &&
    Number.isSafeInteger(value.reviewedUnitPriceCentavos) &&
    Number(value.reviewedUnitPriceCentavos) >= 0 &&
    (value.pendingUnitPriceCentavos === undefined ||
      (Number.isSafeInteger(value.pendingUnitPriceCentavos) &&
        Number(value.pendingUnitPriceCentavos) >= 0)) &&
    Number.isSafeInteger(value.quantity) &&
    Number(value.quantity) > 0 &&
    Number(value.quantity) <= MAX_POSTGRES_INTEGER &&
    ['available', 'sold-out', 'removed'].includes(value.availability as string)
  )
}
