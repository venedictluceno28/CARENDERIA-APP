import {
  MENU_CATEGORIES,
  type MenuCategory,
  type PublishedMenuItem,
} from './types.ts'

export function itemsForCategory(
  items: PublishedMenuItem[],
  category: MenuCategory,
): PublishedMenuItem[] {
  return items.filter((item) => item.category === category)
}

export function availableCategories(
  items: PublishedMenuItem[],
): MenuCategory[] {
  return MENU_CATEGORIES.filter((category) =>
    items.some((item) => item.category === category),
  )
}
