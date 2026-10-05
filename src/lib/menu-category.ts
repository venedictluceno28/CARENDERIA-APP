export const MENU_CATEGORIES = ['ULAM', 'DESSERTS', 'EXTRAS'] as const

export type MenuCategory = (typeof MENU_CATEGORIES)[number]

export function isMenuCategory(value: string): value is MenuCategory {
  return MENU_CATEGORIES.includes(value as MenuCategory)
}
