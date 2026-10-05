import { MENU_CATEGORIES, type MenuCategory } from '../../lib/menu-category.ts'

export const CATALOG_CATEGORIES = MENU_CATEGORIES
export type CatalogCategory = MenuCategory
export type ArchiveFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL'

export type CatalogItem = {
  id: string
  name: string
  category: CatalogCategory
  priceCentavos: number
  internalDfCentavos: number
  photoPath: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export type CatalogItemInput = {
  id: string
  name: string
  category: CatalogCategory
  priceCentavos: number
  internalDfCentavos: number
  photoPath?: string
}
