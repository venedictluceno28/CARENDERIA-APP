import type { MenuCategory } from '../../lib/menu-category.ts'

export type MenuCatalogItem = {
  id: string
  name: string
  category: MenuCategory
  priceCentavos: number
  internalDfCentavos: number
  photoPath: string
}

export type AdminMenuItem = {
  id: string
  catalogItemId: string | null
  name: string
  category: MenuCategory
  priceCentavos: number
  internalDfCentavos: number
  photoPath: string
  isSoldOut: boolean
  sortOrder: number
}

export type AdminActiveMenu = {
  id: string
  imagePath: string
  activatedAt: string
  expiresAt: string
  items: AdminMenuItem[]
}

export type CustomerPreviewItem = Omit<
  AdminMenuItem,
  'catalogItemId' | 'internalDfCentavos' | 'sortOrder'
>
