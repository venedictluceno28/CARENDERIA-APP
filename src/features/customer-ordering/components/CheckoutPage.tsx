import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AppHeader } from '../../../components/layout/AppHeader'
import { AppBackground, PageContainer } from '../../../components/layout/Page'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import {
  ChoiceCard,
  Field,
  Input,
  Textarea,
} from '../../../components/ui/FormControls'
import { Icon } from '../../../components/ui/Icon'
import { GlassSurface, SectionHeading } from '../../../components/ui/Surface'
import {
  createCheckoutAttempt,
  submitCheckout,
  type CheckoutIntent,
} from '../../../lib/api/checkout'
import { AppError } from '../../../lib/api/errors'
import { formatPeso } from '../../../lib/format-money'
import { cartHasBlockingChanges, cartSubtotal } from '../cart'
import { useCustomerCart } from '../cart-context'
import {
  buildCheckoutIntent,
  checkoutAttemptForIntent,
  parsePriceConflicts,
  parseUnavailableItemIds,
  type PendingCheckoutAttempt,
} from '../checkout/checkout-flow'
import { activeMenuQueryKey } from '../hooks/use-active-menu'
import {
  NEARBY_AREAS,
  type CheckoutDraft,
  type DeliveryArea,
  type PaymentMethod,
} from '../types'

const STORE_ADDRESS = [
  'Phase 1 Block 44 Lot 54',
  'Marycris Complex',
  'Pasong Camachile 2',
  'General Trias, Cavite',
]

export function CheckoutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    cart,
    checkoutDraft,
    saveCheckoutDraft,
    clearCheckoutDraft,
    clearCartForMenu,
    invalidateCurrentCart,
    applyCheckoutPriceConflicts,
    markCheckoutItemsUnavailable,
    setOpen,
  } = useCustomerCart()
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(
    null,
  )
  const pendingAttempt = useRef<PendingCheckoutAttempt | null>(null)
  const completedReceiptPath = useRef<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutDraft>({ defaultValues: checkoutDraft })
  const values = useWatch({ control })

  if (!cart.items.length || !cart.menuId) {
    return <Navigate replace to={completedReceiptPath.current ?? '/'} />
  }
  const hasBlockingChanges = cartHasBlockingChanges(cart)
  const foodSubtotal = cartSubtotal(cart)

  async function handleCheckout(draft: CheckoutDraft) {
    setSubmissionMessage(null)
    saveCheckoutDraft(draft)
    if (hasBlockingChanges) {
      setSubmissionMessage('Please resolve the cart changes before ordering.')
      return
    }

    let intent: CheckoutIntent
    try {
      intent = buildCheckoutIntent(cart, draft)
    } catch {
      setSubmissionMessage('Please review the required order information.')
      return
    }
    const pending = checkoutAttemptForIntent(
      pendingAttempt.current,
      intent,
      createCheckoutAttempt,
    )
    pendingAttempt.current = pending

    try {
      const result = await submitCheckout(intent, pending.attempt)
      pendingAttempt.current = null
      const receiptPath = `/order/receipt/${result.order_code}`
      completedReceiptPath.current = receiptPath
      clearCartForMenu(intent.publishedMenuId)
      clearCheckoutDraft()
      navigate(receiptPath, {
        replace: true,
        state: {
          guestIdentity: {
            orderCode: result.order_code,
            guestToken: result.guestToken,
          },
        },
      })
    } catch (error) {
      await handleCheckoutError(error)
    }
  }

  async function handleCheckoutError(error: unknown) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError('UNKNOWN_ERROR', 'Checkout could not be completed.')

    if (appError.code === 'PRICE_CHANGED') {
      const conflicts = parsePriceConflicts(appError.details)
      if (conflicts.length) applyCheckoutPriceConflicts(conflicts)
      await queryClient.invalidateQueries({ queryKey: activeMenuQueryKey })
      setOpen(true)
      navigate('/', { replace: true })
      return
    }
    if (
      appError.code === 'ITEM_SOLD_OUT' ||
      appError.code === 'ITEM_NOT_FOUND'
    ) {
      const itemIds = parseUnavailableItemIds(appError.details)
      if (itemIds.length) markCheckoutItemsUnavailable(itemIds)
      await queryClient.invalidateQueries({ queryKey: activeMenuQueryKey })
      setOpen(true)
      navigate('/', { replace: true })
      return
    }
    if (appError.code === 'MENU_INACTIVE' || appError.code === 'MENU_EXPIRED') {
      invalidateCurrentCart(
        'Today’s menu is no longer available. Please check the current menu.',
      )
      navigate('/', { replace: true })
      return
    }
    if (appError.code === 'INVALID_LOCATION') {
      setError('deliveryArea', {
        message: 'Choose one of the available delivery areas.',
      })
      setSubmissionMessage('Please review the delivery area.')
      return
    }
    if (appError.code === 'INVALID_PAYMENT_METHOD') {
      setError('paymentMethod', { message: 'Choose a payment method.' })
      return
    }
    if (appError.code === 'IDEMPOTENCY_CONFLICT') {
      pendingAttempt.current = null
      setSubmissionMessage(
        'Your order details changed. Please review them and try again.',
      )
      return
    }
    if (appError.code === 'NETWORK_ERROR') {
      setSubmissionMessage(
        'We couldn’t confirm the result. Please try again. Your retry is protected from creating a duplicate order.',
      )
      return
    }
    if (appError.code === 'RATE_LIMITED') {
      const retryAfter = retryAfterSeconds(appError.details)
      setSubmissionMessage(
        retryAfter
          ? `Please wait about ${retryAfter} seconds before trying again.`
          : 'Too many attempts were made. Please wait, then try again.',
      )
      return
    }
    if (appError.code === 'RATE_LIMIT_UNAVAILABLE') {
      setSubmissionMessage(
        'Ordering is temporarily busy. Please wait a moment and try again.',
      )
      return
    }
    setSubmissionMessage(
      'We couldn’t complete the order. Please review the details and try again.',
    )
  }

  return (
    <AppBackground className="checkout-page">
      <AppHeader
        subtitle="Secure guest checkout"
        actions={
          <Button onClick={() => navigate('/')} variant="glass">
            Back to menu
          </Button>
        }
      />
      <main>
        <PageContainer className="checkout-flow">
          <header className="checkout-flow__heading">
            <Badge variant="info">Final review</Badge>
            <h1>Complete your order</h1>
            <p>
              Add your delivery details, choose how you’ll pay, and review the
              food in your cart.
            </p>
          </header>

          <form
            className="checkout-form"
            noValidate
            onSubmit={handleSubmit(handleCheckout)}
          >
            <GlassSurface className="checkout-section" variant="strong">
              <SectionHeading
                eyebrow="Your details"
                title="Who and where"
                description="No account is required. We only use these details for this order."
              />
              <div className="form-stack">
                <Field
                  error={errors.customerName?.message}
                  htmlFor="customer-name"
                  label="Customer name"
                  required
                >
                  <Input
                    autoComplete="name"
                    id="customer-name"
                    placeholder="Juan Dela Cruz"
                    {...register('customerName', {
                      validate: (value) =>
                        Boolean(value.trim()) || 'Enter the customer name.',
                      maxLength: {
                        value: 160,
                        message: 'Keep the name under 160 characters.',
                      },
                    })}
                    aria-describedby={
                      errors.customerName ? 'customer-name-error' : undefined
                    }
                    aria-invalid={Boolean(errors.customerName)}
                  />
                </Field>
                <Field
                  description="Include block, lot, street, phase, and a helpful landmark."
                  error={errors.exactAddress?.message}
                  htmlFor="exact-address"
                  label="Exact delivery address"
                  required
                >
                  <Textarea
                    autoComplete="street-address"
                    id="exact-address"
                    placeholder="Block / Lot / Street / Phase / landmark"
                    rows={4}
                    {...register('exactAddress', {
                      validate: (value) =>
                        Boolean(value.trim()) ||
                        'Enter the exact delivery address.',
                      maxLength: {
                        value: 1000,
                        message: 'Keep the address under 1,000 characters.',
                      },
                    })}
                    aria-describedby="exact-address-description exact-address-error"
                    aria-invalid={Boolean(errors.exactAddress)}
                  />
                </Field>
              </div>
              <aside className="store-location">
                <span>
                  <Icon name="store" />
                </span>
                <div>
                  <strong>Store location</strong>
                  <address>{STORE_ADDRESS.join(', ')}</address>
                </div>
              </aside>
            </GlassSurface>

            <GlassSurface className="checkout-section" variant="strong">
              <SectionHeading
                eyebrow="Delivery"
                title="Choose your area"
                description="Nearby areas can qualify for free delivery. The system calculates the final charge securely."
              />
              <fieldset className="checkout-choice-group">
                <legend className="sr-only">Delivery area</legend>
                {NEARBY_AREAS.map((area) => (
                  <ChoiceCard
                    description="Nearby promotional area"
                    key={area}
                    label={area}
                    value={area}
                    {...register('deliveryArea', {
                      required: 'Choose a delivery area.',
                    })}
                  />
                ))}
                <ChoiceCard
                  description="An additional ₱20 far-area charge applies."
                  label="Outside these areas"
                  value="OUTSIDE"
                  {...register('deliveryArea', {
                    required: 'Choose a delivery area.',
                  })}
                />
              </fieldset>
              {errors.deliveryArea && (
                <p className="field__error" role="alert">
                  {errors.deliveryArea.message}
                </p>
              )}
              <div className="promotion-note">
                <Icon name="sparkles" />
                <p>
                  <strong>2 ULAM = FREE DELIVERY</strong> is a common promotion.
                  Actual qualification is calculated securely by the system and
                  may include other eligible food.
                </p>
              </div>
            </GlassSurface>

            <GlassSurface className="checkout-section" variant="strong">
              <SectionHeading eyebrow="Payment" title="How will you pay?" />
              <fieldset className="checkout-choice-group checkout-choice-group--two">
                <legend className="sr-only">Payment method</legend>
                <ChoiceCard
                  description="Pay when your order arrives."
                  label="Cash"
                  value="CASH"
                  {...register('paymentMethod', {
                    required: 'Choose a payment method.',
                  })}
                />
                <ChoiceCard
                  description="Place the order first, then send your payment receipt through Messages for manual verification."
                  label="Online payment"
                  value="ONLINE_PAYMENT"
                  {...register('paymentMethod', {
                    required: 'Choose a payment method.',
                  })}
                />
              </fieldset>
              {errors.paymentMethod && (
                <p className="field__error" role="alert">
                  {errors.paymentMethod.message}
                </p>
              )}
            </GlassSurface>

            <GlassSurface
              className="checkout-section order-review"
              variant="strong"
            >
              <SectionHeading
                eyebrow="Review"
                title="Your order"
                description="Prices, availability, delivery, and the final total are validated again when you place the order."
              />
              <ul className="review-items">
                {cart.items.map((item) => (
                  <li key={item.publishedMenuItemId}>
                    <span>
                      <strong>
                        {item.quantity}× {item.name}
                      </strong>
                      <small>
                        {formatPeso(item.reviewedUnitPriceCentavos)} each
                      </small>
                    </span>
                    <strong>
                      {formatPeso(
                        item.reviewedUnitPriceCentavos * item.quantity,
                      )}
                    </strong>
                  </li>
                ))}
              </ul>
              <dl className="review-totals">
                <div>
                  <dt>Food subtotal</dt>
                  <dd>{formatPeso(foodSubtotal)}</dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>Calculated securely when you order</dd>
                </div>
                <div>
                  <dt>Estimated grand total</dt>
                  <dd>{formatPeso(foodSubtotal)} + delivery</dd>
                </div>
              </dl>
              <div className="review-details">
                <ReviewValue
                  label="Customer"
                  value={values.customerName?.trim()}
                />
                <ReviewValue
                  label="Exact address"
                  value={values.exactAddress?.trim()}
                />
                <ReviewValue
                  label="Area"
                  value={areaLabel(values.deliveryArea)}
                />
                <ReviewValue
                  label="Payment"
                  value={paymentLabel(values.paymentMethod)}
                />
              </div>
              {hasBlockingChanges && (
                <p className="alert" role="alert">
                  <Icon name="circle-alert" /> Your cart changed. Return to the
                  menu and resolve it before ordering.
                </p>
              )}
              {submissionMessage && (
                <p className="alert" role="alert">
                  <Icon name="circle-alert" /> {submissionMessage}
                </p>
              )}
              <Button
                disabled={hasBlockingChanges}
                loading={isSubmitting}
                size="large"
                type="submit"
              >
                Complete order
              </Button>
              <p className="checkout-submit-note">
                <Icon name="lock" /> Your order is created only after secure
                server validation.
              </p>
            </GlassSurface>
          </form>
        </PageContainer>
      </main>
    </AppBackground>
  )
}

function ReviewValue({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || 'Not provided yet'}</strong>
    </div>
  )
}

function areaLabel(value?: DeliveryArea | ''): string | undefined {
  return value === 'OUTSIDE' ? 'Outside nearby areas' : value || undefined
}

function paymentLabel(value?: PaymentMethod | ''): string | undefined {
  return value === 'ONLINE_PAYMENT'
    ? 'Online payment — manual verification'
    : value === 'CASH'
      ? 'Cash'
      : undefined
}

function retryAfterSeconds(details: unknown): number | null {
  if (!details || typeof details !== 'object') return null
  const value = Number((details as Record<string, unknown>).retryAfterSeconds)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}
