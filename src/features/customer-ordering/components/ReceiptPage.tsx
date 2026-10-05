import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../../../components/layout/AppHeader'
import { AppBackground, PageContainer } from '../../../components/layout/Page'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../../components/ui/Feedback'
import { Icon } from '../../../components/ui/Icon'
import { GlassSurface, SectionHeading } from '../../../components/ui/Surface'
import { AppError } from '../../../lib/api/errors'
import {
  getGuestReceipt,
  type GuestReceipt,
} from '../../../lib/api/guest-access'
import { formatDeliveryCharge, formatPeso } from '../../../lib/format-money'
import {
  getGuestOrderSession,
  type GuestOrderSession,
} from '../../../lib/guest-session'
import { receiptPaymentStatus } from '../checkout/receipt-model'

type ReceiptLocationState = {
  guestIdentity?: Pick<GuestOrderSession, 'orderCode' | 'guestToken'>
}

export function ReceiptPage() {
  const { orderCode = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const persisted = getGuestOrderSession(orderCode)
  const transient = (location.state as ReceiptLocationState | null)
    ?.guestIdentity
  const identity =
    persisted ?? (transient?.orderCode === orderCode ? transient : null)
  const receipt = useQuery({
    queryKey: ['guest', 'receipt', orderCode],
    queryFn: () => getGuestReceipt(identity!),
    enabled: Boolean(identity),
    retry: (count, error) =>
      count < 2 &&
      !(error instanceof AppError && error.code === 'GUEST_ACCESS_DENIED'),
    staleTime: 30_000,
  })

  return (
    <AppBackground className="receipt-page">
      <AppHeader
        subtitle="Order receipt"
        actions={
          <Button onClick={() => navigate('/')} variant="glass">
            Today’s menu
          </Button>
        }
      />
      <main>
        <PageContainer className="receipt-shell">
          {!identity ? (
            <ExpiredReceiptState orderCode={orderCode} />
          ) : receipt.isPending ? (
            <ReceiptLoading />
          ) : receipt.isError ? (
            receipt.error instanceof AppError &&
            receipt.error.code === 'GUEST_ACCESS_DENIED' ? (
              <ExpiredReceiptState orderCode={orderCode} />
            ) : (
              <GlassSurface variant="strong">
                <ErrorState
                  title="We couldn’t reopen this receipt"
                  description="Check your connection and try again. Your order was not changed."
                  onRetry={() => void receipt.refetch()}
                />
              </GlassSurface>
            )
          ) : (
            <ReceiptView receipt={receipt.data} />
          )}
        </PageContainer>
      </main>
    </AppBackground>
  )
}

export function ReceiptView({ receipt }: { receipt: GuestReceipt }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const online = receipt.payment_method === 'ONLINE_PAYMENT'
  const paymentStatus = receiptPaymentStatus(receipt)

  async function copyOrderCode() {
    try {
      await navigator.clipboard.writeText(receipt.order_code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className="receipt">
      <GlassSurface className="receipt-hero" variant="strong">
        <span className="receipt-hero__check">
          <Icon name="check" />
        </span>
        <Badge variant="available">Order placed</Badge>
        <h1>Thank you, {receipt.customer_name}!</h1>
        <p>Your order was securely accepted by the store.</p>
        <div className="order-code-block">
          <span>Order code</span>
          <strong>{receipt.order_code}</strong>
          <Button
            aria-label={`Copy order code ${receipt.order_code}`}
            onClick={() => void copyOrderCode()}
            variant="secondary"
          >
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        </div>
        <p className="order-code-note">
          Keep this reference code for support. It is not a password or access
          credential.
        </p>
      </GlassSurface>

      {online && (
        <GlassSurface className="payment-next-step" variant="strong">
          <div>
            <Badge
              variant={paymentStatus === 'Verified' ? 'verified' : 'unverified'}
            >
              {paymentStatus === 'Verified'
                ? 'Payment verified'
                : 'Payment not verified'}
            </Badge>
            <h2>Send your payment receipt</h2>
            <p>
              Send your payment receipt through Messages so the admin can verify
              your payment.
            </p>
          </div>
          <Button
            icon="message"
            onClick={() =>
              navigate(`/order/receipt/${receipt.order_code}/message`)
            }
            size="large"
          >
            Message admin
          </Button>
        </GlassSurface>
      )}

      <GlassSurface className="receipt-section" variant="strong">
        <SectionHeading eyebrow="Receipt" title="Order details" />
        <ul className="receipt-items">
          {receipt.items.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <span>
                <strong>
                  {item.quantity}× {item.name}
                </strong>
                <small>
                  {item.category} · {formatPeso(item.unit_price_centavos)} each
                </small>
              </span>
              <strong>{formatPeso(item.item_subtotal_centavos)}</strong>
            </li>
          ))}
        </ul>
        <dl className="receipt-totals">
          <div>
            <dt>Food subtotal</dt>
            <dd>{formatPeso(receipt.food_subtotal_centavos)}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>
              {formatDeliveryCharge(receipt.customer_delivery_charge_centavos)}
            </dd>
          </div>
          <div className="receipt-totals__grand">
            <dt>Grand total</dt>
            <dd>{formatPeso(receipt.grand_total_centavos)}</dd>
          </div>
        </dl>
      </GlassSurface>

      <GlassSurface className="receipt-section" variant="strong">
        <SectionHeading eyebrow="Delivery" title="Customer information" />
        <dl className="receipt-details">
          <div>
            <dt>Customer</dt>
            <dd>{receipt.customer_name}</dd>
          </div>
          <div>
            <dt>Exact address</dt>
            <dd>{receipt.exact_address}</dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>{receipt.selected_area_name || 'Outside nearby areas'}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>{online ? 'Online payment' : 'Cash'}</dd>
          </div>
          <div>
            <dt>Order time</dt>
            <dd>{formatOrderTime(receipt.created_at)}</dd>
          </div>
        </dl>
      </GlassSurface>

      <div className="receipt-actions">
        {!online && (
          <Button
            icon="message"
            onClick={() =>
              navigate(`/order/receipt/${receipt.order_code}/message`)
            }
            variant="secondary"
          >
            Message admin
          </Button>
        )}
        <Button
          onClick={() => navigate('/')}
          variant={online ? 'secondary' : 'ghost'}
        >
          Back to today’s menu
        </Button>
      </div>
    </article>
  )
}

function ReceiptLoading() {
  return (
    <div
      className="receipt-loading"
      aria-label="Loading secure receipt"
      role="status"
    >
      <Skeleton className="receipt-loading__hero" />
      <Skeleton className="receipt-loading__section" />
      <Skeleton className="receipt-loading__section" />
    </div>
  )
}

function ExpiredReceiptState({ orderCode }: { orderCode: string }) {
  const navigate = useNavigate()
  return (
    <GlassSurface variant="strong">
      <EmptyState
        icon="clock"
        title="This order’s guest access has expired"
        description={`Guest receipt access lasts 24 hours. You can still use ${orderCode || 'the order code'} as a reference when contacting the store through another channel.`}
        action={
          <Button onClick={() => navigate('/')}>Return to today’s menu</Button>
        }
      />
    </GlassSurface>
  )
}

function formatOrderTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date)
}
