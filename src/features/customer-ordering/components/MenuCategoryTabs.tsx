import type { MenuCategory } from '../types'

const LABELS: Record<MenuCategory, string> = {
  ULAM: 'Ulam',
  DESSERTS: 'Desserts',
  EXTRAS: 'Extras',
}

export function MenuCategoryTabs({
  categories,
  selected,
  onSelect,
}: {
  categories: MenuCategory[]
  selected: MenuCategory
  onSelect: (category: MenuCategory) => void
}) {
  return (
    <div className="category-tabs" aria-label="Menu categories" role="tablist">
      {categories.map((category) => (
        <button
          aria-selected={selected === category}
          className="category-tabs__tab"
          key={category}
          onClick={() => onSelect(category)}
          role="tab"
          type="button"
        >
          {LABELS[category]}
        </button>
      ))}
    </div>
  )
}
