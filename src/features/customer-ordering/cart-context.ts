import { createContext, useContext } from 'react'
import type {
  CartState,
  CheckoutDraft,
  PublishedMenu,
  PublishedMenuItem,
} from './types'
import type { PriceConflict } from './cart'

export type CartContextValue = {
  cart: CartState
  isOpen: boolean
  notice: string
  checkoutDraft: CheckoutDraft
  addItem: (menu: PublishedMenu, item: PublishedMenuItem) => void
  buyItem: (menu: PublishedMenu, item: PublishedMenuItem) => void
  setQuantity: (itemId: string, quantity: number) => void
  removeItem: (itemId: string) => void
  acceptPrices: () => void
  reconcile: (menu: PublishedMenu | null) => void
  applyCheckoutPriceConflicts: (conflicts: PriceConflict[]) => void
  markCheckoutItemsUnavailable: (itemIds: string[]) => void
  clearCartForMenu: (menuId: string) => void
  invalidateCurrentCart: (message: string) => void
  saveCheckoutDraft: (draft: CheckoutDraft) => void
  clearCheckoutDraft: () => void
  setOpen: (open: boolean) => void
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCustomerCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context)
    throw new Error(
      'useCustomerCart must be used inside CustomerOrderingProvider',
    )
  return context
}
