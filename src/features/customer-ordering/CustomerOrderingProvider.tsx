import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  CART_STORAGE_KEY,
  acceptCurrentPrices,
  addMenuItem,
  applyPriceConflicts,
  emptyCart,
  markCartItemsUnavailable,
  parsePersistedCart,
  reconcileCart,
  removeCartItem,
  setCartItemQuantity,
} from './cart'
import { CartContext } from './cart-context'
import type {
  CartState,
  CheckoutDraft,
  PublishedMenu,
  PublishedMenuItem,
} from './types'

const EMPTY_CHECKOUT_DRAFT: CheckoutDraft = {
  customerName: '',
  exactAddress: '',
  deliveryArea: '',
  paymentMethod: '',
}

function readCart(): CartState {
  try {
    return parsePersistedCart(
      globalThis.localStorage?.getItem(CART_STORAGE_KEY),
    )
  } catch {
    return parsePersistedCart(null)
  }
}

export function CustomerOrderingProvider({
  children,
}: {
  children: ReactNode
}) {
  const [cart, setCart] = useState<CartState>(readCart)
  const [isOpen, setOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [checkoutDraft, saveCheckoutDraft] =
    useState<CheckoutDraft>(EMPTY_CHECKOUT_DRAFT)

  useEffect(() => {
    try {
      if (cart.items.length) {
        globalThis.localStorage?.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
      } else {
        globalThis.localStorage?.removeItem(CART_STORAGE_KEY)
      }
    } catch {
      // Storage is a convenience only; the in-memory cart remains usable.
    }
  }, [cart])

  const addItem = useCallback(
    (menu: PublishedMenu, item: PublishedMenuItem) => {
      if (item.isSoldOut) return
      setCart((current) => addMenuItem(current, menu, item))
      setNotice(`${item.name} added to your cart.`)
    },
    [],
  )

  const buyItem = useCallback(
    (menu: PublishedMenu, item: PublishedMenuItem) => {
      if (item.isSoldOut) return
      setCart((current) => addMenuItem(current, menu, item))
      setNotice(`${item.name} added to your cart.`)
      setOpen(true)
    },
    [],
  )

  const setQuantity = useCallback((itemId: string, quantity: number) => {
    setCart((current) => setCartItemQuantity(current, itemId, quantity))
  }, [])

  const removeItem = useCallback((itemId: string) => {
    setCart((current) => removeCartItem(current, itemId))
  }, [])

  const acceptPrices = useCallback(() => {
    setCart(acceptCurrentPrices)
    setNotice('Your cart now uses the prices shown today.')
  }, [])

  const reconcile = useCallback((menu: PublishedMenu | null) => {
    setCart((current) => {
      const result = reconcileCart(current, menu)
      if (result.event === 'menu-cleared') {
        setNotice('Your cart was cleared because today’s menu changed.')
      } else if (result.event === 'availability-changed') {
        setNotice('An item in your cart is no longer available.')
      } else if (result.event === 'price-changed') {
        setNotice('A price changed. Please review your cart.')
      }
      return result.cart
    })
  }, [])

  const applyCheckoutPriceConflicts = useCallback(
    (conflicts: Parameters<typeof applyPriceConflicts>[1]) => {
      setCart((current) => applyPriceConflicts(current, conflicts))
      setNotice('A price changed. Please review and accept the updated price.')
    },
    [],
  )

  const markCheckoutItemsUnavailable = useCallback((itemIds: string[]) => {
    setCart((current) => markCartItemsUnavailable(current, itemIds))
    setNotice('An item in your cart is now sold out. Remove it to continue.')
  }, [])

  const clearCartForMenu = useCallback((menuId: string) => {
    setCart((current) => (current.menuId === menuId ? emptyCart() : current))
  }, [])

  const invalidateCurrentCart = useCallback((message: string) => {
    setCart(emptyCart())
    setNotice(message)
  }, [])

  const clearCheckoutDraft = useCallback(() => {
    saveCheckoutDraft(EMPTY_CHECKOUT_DRAFT)
  }, [])

  const value = useMemo(
    () => ({
      cart,
      isOpen,
      notice,
      checkoutDraft,
      addItem,
      buyItem,
      setQuantity,
      removeItem,
      acceptPrices,
      reconcile,
      applyCheckoutPriceConflicts,
      markCheckoutItemsUnavailable,
      clearCartForMenu,
      invalidateCurrentCart,
      saveCheckoutDraft,
      clearCheckoutDraft,
      setOpen,
    }),
    [
      cart,
      isOpen,
      notice,
      checkoutDraft,
      addItem,
      buyItem,
      setQuantity,
      removeItem,
      acceptPrices,
      reconcile,
      applyCheckoutPriceConflicts,
      markCheckoutItemsUnavailable,
      clearCartForMenu,
      invalidateCurrentCart,
      clearCheckoutDraft,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
