import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CustomerMenuExperience } from '../features/customer-ordering/components/CustomerMenuExperience'
import { useCustomerCart } from '../features/customer-ordering/cart-context'
import type {
  MenuLoadState,
  PublishedMenu,
} from '../features/customer-ordering/types'

const image = (color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#152b72"/></linearGradient></defs><rect width="800" height="560" fill="url(#g)"/><circle cx="400" cy="260" r="150" fill="white" fill-opacity=".16"/><text x="400" y="290" fill="white" font-family="sans-serif" font-size="54" font-weight="700" text-anchor="middle">${label}</text></svg>`)}`

const previewMenu: PublishedMenu = {
  id: '11111111-1111-4111-8111-111111111111',
  imagePath: image('#6845d9', 'TODAY’S MENU'),
  activatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  items: [
    [
      '21111111-1111-4111-8111-111111111111',
      'Chicken Adobo',
      'ULAM',
      8500,
      '#356bdc',
      false,
    ],
    [
      '21111111-1111-4111-8111-222222222222',
      'Creamy Beef Caldereta with Garden Vegetables',
      'ULAM',
      12000,
      '#c04e56',
      false,
    ],
    [
      '21111111-1111-4111-8111-333333333333',
      'Pork Sinigang',
      'ULAM',
      9500,
      '#14857d',
      true,
    ],
    [
      '21111111-1111-4111-8111-444444444444',
      'Leche Flan',
      'DESSERTS',
      4500,
      '#d58a24',
      false,
    ],
    [
      '21111111-1111-4111-8111-555555555555',
      'Buko Pandan',
      'DESSERTS',
      5000,
      '#3a9d6f',
      false,
    ],
    [
      '21111111-1111-4111-8111-666666666666',
      'Extra Rice',
      'EXTRAS',
      1500,
      '#7d6d55',
      false,
    ],
  ].map(([id, name, category, price, color, soldOut], sortOrder) => ({
    id: String(id),
    publishedMenuId: '11111111-1111-4111-8111-111111111111',
    name: String(name),
    category: category as 'ULAM' | 'DESSERTS' | 'EXTRAS',
    unitPriceCentavos: Number(price),
    imagePath: image(String(color), String(name)),
    isSoldOut: Boolean(soldOut),
    sortOrder,
  })),
}

export function CustomerOrderingPreviewPage() {
  const [params] = useSearchParams()
  const seeded = useRef(false)
  const { addItem, setOpen } = useCustomerCart()
  const view = params.get('state')
  const cartPreview = params.get('cart')

  useEffect(() => {
    const previousFontSize = document.documentElement.dataset.fontSize
    if (params.get('font') === 'extra-large') {
      document.documentElement.dataset.fontSize = 'extra-large'
    }
    if (!seeded.current && cartPreview) {
      seeded.current = true
      addItem(previewMenu, previewMenu.items[0])
      if (cartPreview === 'multi') {
        addItem(previewMenu, previewMenu.items[0])
        addItem(previewMenu, previewMenu.items[3])
      }
      setOpen(true)
    }
    return () => {
      document.documentElement.dataset.fontSize = previousFontSize
    }
  }, [addItem, cartPreview, params, setOpen])

  let state: MenuLoadState
  if (view === 'loading') state = { status: 'loading' }
  else if (view === 'error') state = { status: 'error', retry: () => undefined }
  else if (view === 'empty')
    state = { status: 'success', menu: null, refresh: () => undefined }
  else
    state = { status: 'success', menu: previewMenu, refresh: () => undefined }
  return <CustomerMenuExperience state={state} />
}
