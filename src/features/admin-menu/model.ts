import { validateProductImage } from '../../lib/image-upload.ts'
import { MENU_CATEGORIES, type MenuCategory } from '../../lib/menu-category.ts'
import type {
  AdminActiveMenu,
  CustomerPreviewItem,
  MenuCatalogItem,
} from './types.ts'

export const adminMenuQueryKeys = {
  active: ['admin-menu', 'active'] as const,
  catalog: ['admin-menu', 'catalog'] as const,
}

export function validateMenuImage(file: File | null) {
  return validateProductImage(file, 'menu image')
}

export function toggleMenuSelection(selected: string[], itemId: string) {
  return selected.includes(itemId)
    ? selected.filter((id) => id !== itemId)
    : [...selected, itemId]
}

export function catalogByCategory(items: MenuCatalogItem[]) {
  return MENU_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0)
}

export function customerPreviewItems(menu: AdminActiveMenu) {
  return menu.items.map<CustomerPreviewItem>((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    priceCentavos: item.priceCentavos,
    photoPath: item.photoPath,
    isSoldOut: item.isSoldOut,
  }))
}

export function isValidPublishSelection(
  selectedIds: string[],
  catalog: MenuCatalogItem[],
) {
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length)
    return false
  const selectable = new Set(catalog.map((item) => item.id))
  return selectedIds.every((id) => selectable.has(id))
}

export function formatManilaDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

export function categoryLabel(category: MenuCategory) {
  return category === 'ULAM'
    ? 'ULAM'
    : category === 'DESSERTS'
      ? 'DESSERTS'
      : 'EXTRAS'
}
