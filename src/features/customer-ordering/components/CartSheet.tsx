import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import { EmptyState } from '../../../components/ui/Feedback'
import { Icon } from '../../../components/ui/Icon'
import { formatPeso } from '../../../lib/format-money'
import { cartHasBlockingChanges, cartItemCount, cartSubtotal } from '../cart'
import { useCustomerCart } from '../cart-context'
import { FoodImage } from './FoodImage'

export function CartSheet() {
  const navigate = useNavigate()
  const { cart, isOpen, setOpen, setQuantity, removeItem, acceptPrices } =
    useCustomerCart()
  const count = cartItemCount(cart)
  const hasBlockingChanges = cartHasBlockingChanges(cart)
  const hasPriceChanges = cart.items.some(
    (item) => item.pendingUnitPriceCentavos !== undefined,
  )

  return (
    <Dialog
      description={
        count ? `${count} ${count === 1 ? 'item' : 'items'}` : undefined
      }
      footer={
        cart.items.length ? (
          <div className="cart-footer">
            <div>
              <span>Food subtotal</span>
              <strong>{formatPeso(cartSubtotal(cart))}</strong>
              <small>Delivery and final total are confirmed at checkout.</small>
            </div>
            <Button
              disabled={hasBlockingChanges}
              iconAfter="arrow-right"
              onClick={() => {
                setOpen(false)
                navigate('/order/address')
              }}
              size="large"
            >
              Proceed to order
            </Button>
          </div>
        ) : undefined
      }
      onOpenChange={setOpen}
      open={isOpen}
      title="Your cart"
    >
      {!cart.items.length ? (
        <EmptyState
          icon="shopping-bag"
          title="Your cart is empty"
          description="Add something delicious from today’s menu."
        />
      ) : (
        <div className="cart-content">
          {hasBlockingChanges && (
            <div className="cart-alert" role="alert">
              <Icon name="circle-alert" />
              <div>
                <strong>Please review your cart</strong>
                <p>
                  Resolve unavailable items and review updated prices before
                  proceeding.
                </p>
              </div>
            </div>
          )}
          <ul className="cart-list">
            {cart.items.map((item) => {
              const unavailable = item.availability !== 'available'
              return (
                <li className="cart-item" key={item.publishedMenuItemId}>
                  <FoodImage
                    alt={item.name}
                    className="cart-item__image"
                    src={item.imagePath}
                  />
                  <div className="cart-item__main">
                    <div className="cart-item__heading">
                      <div>
                        <h3>{item.name}</h3>
                        <p>{item.category}</p>
                      </div>
                      <strong>
                        {formatPeso(
                          item.reviewedUnitPriceCentavos * item.quantity,
                        )}
                      </strong>
                    </div>
                    {unavailable && (
                      <p className="cart-item__warning">
                        {item.availability === 'sold-out'
                          ? 'Now sold out — remove this item to proceed.'
                          : 'No longer on today’s menu — remove this item to proceed.'}
                      </p>
                    )}
                    {item.pendingUnitPriceCentavos !== undefined && (
                      <p className="cart-item__warning">
                        Price updated:{' '}
                        <s>{formatPeso(item.reviewedUnitPriceCentavos)}</s> →{' '}
                        {formatPeso(item.pendingUnitPriceCentavos)}
                      </p>
                    )}
                    <div className="cart-item__controls">
                      <div
                        className="quantity-control"
                        aria-label={`Quantity for ${item.name}`}
                      >
                        <Button
                          aria-label={`Decrease ${item.name} quantity`}
                          onClick={() =>
                            setQuantity(
                              item.publishedMenuItemId,
                              item.quantity - 1,
                            )
                          }
                          size="icon"
                          variant="secondary"
                        >
                          <Icon name="minus" />
                        </Button>
                        <output aria-live="polite">{item.quantity}</output>
                        <Button
                          aria-label={`Increase ${item.name} quantity`}
                          onClick={() =>
                            setQuantity(
                              item.publishedMenuItemId,
                              item.quantity + 1,
                            )
                          }
                          size="icon"
                          variant="secondary"
                        >
                          <Icon name="plus" />
                        </Button>
                      </div>
                      <Button
                        aria-label={`Remove ${item.name} from cart`}
                        onClick={() => removeItem(item.publishedMenuItemId)}
                        variant="ghost"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {hasPriceChanges && (
            <Button onClick={acceptPrices} variant="secondary">
              Accept updated prices
            </Button>
          )}
        </div>
      )}
    </Dialog>
  )
}
