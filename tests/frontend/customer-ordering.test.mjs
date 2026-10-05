import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptCurrentPrices,
  addMenuItem,
  cartHasBlockingChanges,
  cartItemCount,
  cartSubtotal,
  emptyCart,
  parsePersistedCart,
  reconcileCart,
  removeCartItem,
  setCartItemQuantity,
} from '../../src/features/customer-ordering/cart.ts'
import {
  availableCategories,
  itemsForCategory,
} from '../../src/features/customer-ordering/menu.ts'

const menu = {
  id: 'menu-1',
  imagePath: '/menu.jpg',
  activatedAt: '2026-10-03T00:00:00Z',
  expiresAt: '2026-10-04T00:00:00Z',
  items: [
    {
      id: 'adobo',
      publishedMenuId: 'menu-1',
      name: 'Chicken Adobo',
      category: 'ULAM',
      unitPriceCentavos: 8000,
      imagePath: '/adobo.jpg',
      isSoldOut: false,
      sortOrder: 0,
    },
    {
      id: 'flan',
      publishedMenuId: 'menu-1',
      name: 'Leche Flan',
      category: 'DESSERTS',
      unitPriceCentavos: 4500,
      imagePath: '/flan.jpg',
      isSoldOut: true,
      sortOrder: 1,
    },
  ],
}

test('presents only populated categories in stable business order', () => {
  assert.deepEqual(availableCategories(menu.items), ['ULAM', 'DESSERTS'])
  assert.deepEqual(
    itemsForCategory(menu.items, 'ULAM').map((item) => item.name),
    ['Chicken Adobo'],
  )
})

test('starts with the customer empty-cart state', () => {
  assert.deepEqual(emptyCart(), { version: 1, menuId: null, items: [] })
})

test('adds an available menu item and duplicate add increments it', () => {
  const once = addMenuItem(emptyCart(), menu, menu.items[0])
  const twice = addMenuItem(once, menu, menu.items[0])
  assert.equal(cartItemCount(twice), 2)
  assert.equal(twice.items[0].quantity, 2)
})

test('never adds a sold-out item', () => {
  assert.deepEqual(addMenuItem(emptyCart(), menu, menu.items[1]), emptyCart())
})

test('increments, decrements, and removes quantities without zero lines', () => {
  const added = addMenuItem(emptyCart(), menu, menu.items[0])
  const incremented = setCartItemQuantity(added, 'adobo', 3)
  assert.equal(incremented.items[0].quantity, 3)
  assert.equal(
    setCartItemQuantity(incremented, 'adobo', 2).items[0].quantity,
    2,
  )
  assert.deepEqual(setCartItemQuantity(added, 'adobo', 0), emptyCart())
  assert.deepEqual(removeCartItem(added, 'adobo'), emptyCart())
})

test('calculates food subtotal from last-reviewed prices', () => {
  const cart = setCartItemQuantity(
    addMenuItem(emptyCart(), menu, menu.items[0]),
    'adobo',
    3,
  )
  assert.equal(cartSubtotal(cart), 24000)
})

test('a different or inactive menu clears the stale cart', () => {
  const cart = addMenuItem(emptyCart(), menu, menu.items[0])
  assert.equal(reconcileCart(cart, null).event, 'menu-cleared')
  assert.deepEqual(
    reconcileCart(cart, { ...menu, id: 'menu-2' }).cart,
    emptyCart(),
  )
})

test('a newly sold-out cart line stays visible and blocks proceeding', () => {
  const cart = addMenuItem(emptyCart(), menu, menu.items[0])
  const result = reconcileCart(cart, {
    ...menu,
    items: [{ ...menu.items[0], isSoldOut: true }],
  })
  assert.equal(result.event, 'availability-changed')
  assert.equal(result.cart.items[0].availability, 'sold-out')
  assert.equal(cartHasBlockingChanges(result.cart), true)
})

test('a changed price requires review before replacing the cart price', () => {
  const cart = addMenuItem(emptyCart(), menu, menu.items[0])
  const result = reconcileCart(cart, {
    ...menu,
    items: [{ ...menu.items[0], unitPriceCentavos: 9000 }],
  })
  assert.equal(result.event, 'price-changed')
  assert.equal(cartSubtotal(result.cart), 8000)
  assert.equal(result.cart.items[0].pendingUnitPriceCentavos, 9000)
  const accepted = acceptCurrentPrices(result.cart)
  assert.equal(cartSubtotal(accepted), 9000)
  assert.equal(cartHasBlockingChanges(accepted), false)
})

test('validates persisted carts defensively', () => {
  const cart = addMenuItem(emptyCart(), menu, menu.items[0])
  assert.deepEqual(parsePersistedCart(JSON.stringify(cart)), cart)
  assert.deepEqual(parsePersistedCart('{broken'), emptyCart())
  assert.deepEqual(
    parsePersistedCart(JSON.stringify({ ...cart, version: 2 })),
    emptyCart(),
  )
  assert.deepEqual(
    parsePersistedCart(
      JSON.stringify({
        ...cart,
        items: [{ ...cart.items[0], quantity: -1 }],
      }),
    ),
    emptyCart(),
  )
})
