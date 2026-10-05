import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { formatPeso } from '../../../lib/format-money'
import { useCustomerCart } from '../cart-context'
import type { PublishedMenu, PublishedMenuItem } from '../types'
import { FoodImage } from './FoodImage'

export function FoodCard({
  menu,
  item,
}: {
  menu: PublishedMenu
  item: PublishedMenuItem
}) {
  const { addItem, buyItem } = useCustomerCart()
  return (
    <article
      className={`food-card${item.isSoldOut ? ' food-card--sold-out' : ''}`}
    >
      <div className="food-card__media">
        <FoodImage alt={item.name} src={item.imagePath} />
        {item.isSoldOut && <Badge variant="sold-out">Sold out</Badge>}
      </div>
      <div className="food-card__body">
        <div>
          <p className="food-card__category">{item.category}</p>
          <h3>{item.name}</h3>
        </div>
        <p className="food-card__price">{formatPeso(item.unitPriceCentavos)}</p>
        <div className="food-card__actions">
          <Button
            aria-label={`Buy ${item.name}`}
            disabled={item.isSoldOut}
            onClick={() => buyItem(menu, item)}
            variant="secondary"
          >
            Buy
          </Button>
          <Button
            aria-label={`Add ${item.name} to cart`}
            disabled={item.isSoldOut}
            onClick={() => addItem(menu, item)}
          >
            Add to cart
          </Button>
        </div>
      </div>
    </article>
  )
}
