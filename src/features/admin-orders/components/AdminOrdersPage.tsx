import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { AdminPageHeader } from '../../../components/layout/AdminPageHeader'
import { AppBackground, PageContainer } from '../../../components/layout/Page'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from '../../../components/ui/Feedback'
import {
  Field,
  Input,
  Select,
  Textarea,
} from '../../../components/ui/FormControls'
import { Icon } from '../../../components/ui/Icon'
import { GlassSurface } from '../../../components/ui/Surface'
import {
  cancelAdminOrder,
  editAdminOrder,
  getAdminDailyTotals,
  getAdminEvidenceSignedUrl,
  getAdminOrderDetail,
  listAdminOrders,
  reconcileAdminRiderDay,
  restoreAdminOrder,
  setAdminPaymentVerification,
  type AdminOrderDetail,
  type AdminOrderSummary,
} from '../../../lib/api/admin-operations'
import { formatPeso } from '../../../lib/format-money'
import { createSecureUuid } from '../../../lib/secure-random-uuid'
import { useAdminSession } from '../../admin-auth'
import {
  adminOrderQueryKeys,
  centavosToPesoInput,
  currentManilaBusinessDate,
  editDraftToTrustedInput,
  filterAdminOrders,
  orderToEditDraft,
  pesoInputToCentavos,
  paymentVerificationAction,
  type AdminOrderEditDraft,
} from '../model'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AdminOrdersPage() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { signOut } = useAdminSession()
  const businessDate = currentManilaBusinessDate()
  const [search, setSearch] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => {
    const state = location.state as { selectedOrderId?: unknown } | null
    return typeof state?.selectedOrderId === 'string'
      ? state.selectedOrderId
      : null
  })
  const [adjustment, setAdjustment] = useState('0.00')
  const [adjustmentTouched, setAdjustmentTouched] = useState(false)
  const [pageNotice, setPageNotice] = useState<string>()

  const orders = useQuery({
    queryKey: adminOrderQueryKeys.list(businessDate),
    queryFn: () => listAdminOrders(businessDate),
    staleTime: 30_000,
  })
  const totals = useQuery({
    queryKey: adminOrderQueryKeys.totals(businessDate),
    queryFn: () => getAdminDailyTotals(businessDate),
    staleTime: 30_000,
  })
  const shownOrders = useMemo(
    () => filterAdminOrders(orders.data ?? [], search),
    [orders.data, search],
  )
  const riderMutation = useMutation({
    mutationFn: (centavos: number) =>
      reconcileAdminRiderDay(businessDate, centavos),
    onSuccess: async (data) => {
      setAdjustment(centavosToPesoInput(data.manual_adjustment_centavos))
      setAdjustmentTouched(false)
      setPageNotice('Rider adjustment saved. The final rider total is updated.')
      await queryClient.invalidateQueries({
        queryKey: adminOrderQueryKeys.totals(businessDate),
      })
    },
  })
  const displayedAdjustment = adjustmentTouched
    ? adjustment
    : centavosToPesoInput(totals.data?.manual_adjustment_centavos ?? 0)

  function saveAdjustment() {
    const centavos = pesoInputToCentavos(displayedAdjustment)
    if (centavos === null) return
    riderMutation.mutate(centavos)
  }

  return (
    <AppBackground className="admin-background admin-orders-background">
      <AdminPageHeader onLogout={signOut} subtitle="Today’s orders" />
      <main>
        <PageContainer className="admin-orders-shell">
          <header className="orders-page-heading">
            <div>
              <p className="eyebrow">Asia/Manila · {businessDate}</p>
              <h1>Today’s Orders</h1>
              <p>
                Trusted order operations and rider reconciliation in one
                workspace.
              </p>
            </div>
          </header>

          {totals.isPending ? (
            <div
              className="orders-summary-grid"
              aria-label="Loading daily totals"
            >
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="orders-summary-skeleton" />
              ))}
            </div>
          ) : totals.isError ? (
            <ErrorState
              description={messageOf(totals.error)}
              onRetry={() => void totals.refetch()}
            />
          ) : totals.data ? (
            <section className="orders-summary-grid" aria-label="Daily totals">
              <Summary
                label="Active orders"
                value={String(totals.data.active_order_count)}
              />
              <Summary
                label="Sales"
                value={formatPeso(totals.data.sales_centavos)}
              />
              <Summary
                label="Delivery collected"
                value={formatPeso(
                  totals.data.customer_delivery_charge_centavos,
                )}
              />
              <Summary
                label="Calculated rider"
                value={formatPeso(totals.data.calculated_rider_centavos)}
              />
              <Summary
                label="Final rider"
                value={formatPeso(totals.data.final_rider_centavos)}
                highlight
              />
              <p className="cancelled-total">
                Cancelled today:{' '}
                <strong>{totals.data.cancelled_order_count}</strong>
              </p>
            </section>
          ) : null}

          <GlassSurface className="rider-reconciliation" variant="strong">
            <div>
              <p className="eyebrow">Rider reconciliation</p>
              <h2>Adjust the rider total</h2>
              <p>
                Enter a signed amount: +20 adds ₱20 and -10 subtracts ₱10. The
                final rider amount cannot go below zero.
              </p>
            </div>
            <div className="rider-reconciliation__form">
              <Field
                htmlFor="rider-adjustment"
                label="Adjustment (₱)"
                error={
                  displayedAdjustment &&
                  pesoInputToCentavos(displayedAdjustment) === null
                    ? 'Use a valid amount with up to two decimals.'
                    : undefined
                }
              >
                <Input
                  id="rider-adjustment"
                  inputMode="decimal"
                  value={displayedAdjustment}
                  onChange={(event) => {
                    setAdjustment(event.target.value)
                    setAdjustmentTouched(true)
                  }}
                />
              </Field>
              <Button
                disabled={pesoInputToCentavos(displayedAdjustment) === null}
                loading={riderMutation.isPending}
                onClick={saveAdjustment}
              >
                Save adjustment
              </Button>
            </div>
            {riderMutation.isError && (
              <p className="form-error" role="alert">
                {messageOf(riderMutation.error)}
              </p>
            )}
            {pageNotice && (
              <p className="action-notice" role="status">
                <Icon name="check" /> {pageNotice}
              </p>
            )}
          </GlassSurface>

          <section
            className="orders-list-section"
            aria-labelledby="orders-list-title"
          >
            <div className="orders-list-heading">
              <div>
                <p className="eyebrow">Newest first</p>
                <h2 id="orders-list-title">Orders</h2>
              </div>
              <div className="orders-list-tools">
                <label className="orders-search">
                  <span>Search name or code</span>
                  <Input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="e.g. Maria or DV-1042"
                  />
                </label>
                <Button
                  loading={orders.isFetching || totals.isFetching}
                  onClick={() => {
                    setPageNotice(undefined)
                    void Promise.all([orders.refetch(), totals.refetch()])
                  }}
                  variant="secondary"
                >
                  Refresh
                </Button>
              </div>
            </div>
            {orders.isPending ? (
              <div
                className="admin-order-list"
                aria-label="Loading today’s orders"
              >
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton className="admin-order-card-skeleton" key={index} />
                ))}
              </div>
            ) : orders.isError ? (
              <ErrorState
                description={messageOf(orders.error)}
                onRetry={() => void orders.refetch()}
              />
            ) : shownOrders.length ? (
              <div className="admin-order-list">
                {shownOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onOpen={() => setSelectedOrderId(order.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="orders"
                title={search ? 'No matching orders' : 'No orders yet today'}
                description={
                  search
                    ? 'Try a customer name or a different order code.'
                    : 'New online and manual orders will appear here.'
                }
              />
            )}
          </section>
        </PageContainer>
      </main>
      <OrderDetailDialog
        businessDate={businessDate}
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </AppBackground>
  )
}

function Summary({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <GlassSurface
      className={`orders-summary${highlight ? ' orders-summary--highlight' : ''}`}
      variant={highlight ? 'strong' : 'subtle'}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </GlassSurface>
  )
}

function OrderCard({
  order,
  onOpen,
}: {
  order: AdminOrderSummary
  onOpen: () => void
}) {
  return (
    <button
      className={`admin-order-card${order.is_cancelled ? ' admin-order-card--cancelled' : ''}`}
      onClick={onOpen}
      type="button"
    >
      <div className="admin-order-card__top">
        <div>
          <strong>{order.order_code}</strong>
          <span>{timeLabel(order.created_at)}</span>
        </div>
        <strong>{formatPeso(order.grand_total_centavos)}</strong>
      </div>
      <h3>{order.customer_name}</h3>
      <div className="admin-order-card__badges">
        <Badge variant={order.source === 'ONLINE' ? 'online' : 'info'}>
          {order.source === 'ONLINE' ? 'Online' : 'Manual'}
        </Badge>
        <Badge variant={order.payment_method === 'CASH' ? 'cash' : 'online'}>
          {order.payment_method === 'CASH' ? 'Cash' : 'Online payment'}
        </Badge>
        {order.payment_method === 'ONLINE_PAYMENT' && (
          <Badge
            variant={
              order.payment_verification_state === 'VERIFIED'
                ? 'verified'
                : 'unverified'
            }
          >
            {order.payment_verification_state === 'VERIFIED'
              ? 'Verified'
              : 'Not verified'}
          </Badge>
        )}
        {order.is_cancelled && <Badge variant="cancelled">Cancelled</Badge>}
      </div>
      <span className="admin-order-card__open">
        View details <Icon name="arrow-right" />
      </span>
    </button>
  )
}

type PendingAction = 'cancel' | 'restore' | 'verify' | 'reverse' | null

function OrderDetailDialog({
  businessDate,
  orderId,
  onClose,
}: {
  businessDate: string
  orderId: string | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [actionNotice, setActionNotice] = useState<string>()
  const detail = useQuery({
    queryKey: adminOrderQueryKeys.detail(orderId ?? ''),
    queryFn: () => getAdminOrderDetail(orderId!),
    enabled: Boolean(orderId),
  })

  async function invalidateOrder() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: adminOrderQueryKeys.list(businessDate),
      }),
      queryClient.invalidateQueries({
        queryKey: adminOrderQueryKeys.totals(businessDate),
      }),
      orderId
        ? queryClient.invalidateQueries({
            queryKey: adminOrderQueryKeys.detail(orderId),
          })
        : Promise.resolve(),
    ])
  }
  const actionMutation = useMutation({
    mutationFn: async (action: Exclude<PendingAction, null>) => {
      if (!orderId) return
      if (action === 'cancel')
        return cancelAdminOrder(orderId, cancellationReason)
      if (action === 'restore') return restoreAdminOrder(orderId)
      return setAdminPaymentVerification(orderId, action === 'verify')
    },
    onSuccess: async (_data, action) => {
      const notices = {
        cancel: 'Order cancelled. Today’s totals were refreshed.',
        restore: 'Order restored to active totals.',
        verify: 'Online payment marked as verified.',
        reverse: 'Payment verification reversed.',
      }
      setActionNotice(notices[action])
      setPendingAction(null)
      setCancellationReason('')
      await invalidateOrder()
    },
  })

  function close() {
    if (
      editing &&
      editDirty &&
      !window.confirm('Discard your unsaved order changes?')
    )
      return
    setEditing(false)
    setEditDirty(false)
    setPendingAction(null)
    setActionNotice(undefined)
    onClose()
  }
  const order = detail.data
  const verificationAction = order ? paymentVerificationAction(order) : null
  return (
    <Dialog
      open={Boolean(orderId)}
      onOpenChange={(open) => !open && close()}
      title={
        order ? `${order.order_code} · ${order.customer_name}` : 'Order details'
      }
      description="Amounts shown here come from the trusted backend."
    >
      {detail.isPending ? (
        <LoadingState label="Loading complete order…" />
      ) : detail.isError ? (
        <ErrorState
          description={messageOf(detail.error)}
          onRetry={() => void detail.refetch()}
        />
      ) : order ? (
        editing ? (
          <OrderEditForm
            order={order}
            businessDate={businessDate}
            onCancel={() => {
              if (
                !editDirty ||
                window.confirm('Discard your unsaved order changes?')
              ) {
                setEditing(false)
                setEditDirty(false)
              }
            }}
            onDirtyChange={setEditDirty}
            onSaved={() => {
              setEditing(false)
              setEditDirty(false)
              setActionNotice(
                'Order changes saved. All totals were recalculated securely.',
              )
              void invalidateOrder()
            }}
          />
        ) : (
          <div className="order-detail">
            {actionNotice && (
              <p className="action-notice" role="status">
                <Icon name="check" /> {actionNotice}
              </p>
            )}
            <div className="order-detail__status">
              <Badge variant={order.source === 'ONLINE' ? 'online' : 'info'}>
                {order.source}
              </Badge>
              <Badge
                variant={order.payment_method === 'CASH' ? 'cash' : 'online'}
              >
                {order.payment_method === 'CASH' ? 'Cash' : 'Online payment'}
              </Badge>
              {verificationAction && (
                <Badge
                  variant={
                    order.payment_verification_state === 'VERIFIED'
                      ? 'verified'
                      : 'unverified'
                  }
                >
                  {order.payment_verification_state === 'VERIFIED'
                    ? 'Verified'
                    : 'Not verified'}
                </Badge>
              )}
              {order.is_cancelled && (
                <Badge variant="cancelled">Cancelled</Badge>
              )}
            </div>
            <DetailFacts order={order} />
            <section>
              <h3>Items</h3>
              <div className="order-detail__items">
                {order.order_items.map((item) => (
                  <div key={item.id}>
                    <span>
                      <strong>
                        {item.quantity}× {item.name_snapshot}
                      </strong>
                      <small>
                        {item.category_snapshot} ·{' '}
                        {formatPeso(item.unit_price_centavos)} each
                      </small>
                      <small>
                        Internal DF:{' '}
                        {formatPeso(item.internal_df_per_unit_centavos)} each /{' '}
                        {formatPeso(item.internal_df_total_centavos)} total
                      </small>
                    </span>
                    <strong>{formatPeso(item.item_subtotal_centavos)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="order-detail__totals">
              <h3>Trusted totals</h3>
              <dl>
                <div>
                  <dt>Food subtotal</dt>
                  <dd>{formatPeso(order.food_subtotal_centavos)}</dd>
                </div>
                <div>
                  <dt>Internal DF</dt>
                  <dd>{formatPeso(order.internal_df_total_centavos)}</dd>
                </div>
                <div>
                  <dt>Base delivery</dt>
                  <dd>{formatPeso(order.base_delivery_charge_centavos)}</dd>
                </div>
                <div>
                  <dt>Outside-area charge</dt>
                  <dd>{formatPeso(order.far_area_charge_centavos)}</dd>
                </div>
                <div>
                  <dt>Total customer delivery</dt>
                  <dd>{formatPeso(order.customer_delivery_charge_centavos)}</dd>
                </div>
                <div className="order-detail__grand">
                  <dt>Grand total</dt>
                  <dd>{formatPeso(order.grand_total_centavos)}</dd>
                </div>
                <div>
                  <dt>Calculated rider</dt>
                  <dd>{formatPeso(order.calculated_rider_centavos)}</dd>
                </div>
              </dl>
            </section>
            {order.evidence.length > 0 && (
              <EvidencePanel attachmentId={order.evidence[0].id} />
            )}
            <div className="order-detail__actions">
              <Button onClick={() => setEditing(true)}>Edit order</Button>
              {order.is_cancelled ? (
                <Button
                  onClick={() => setPendingAction('restore')}
                  variant="secondary"
                >
                  Restore order
                </Button>
              ) : (
                <Button
                  onClick={() => setPendingAction('cancel')}
                  variant="destructive"
                >
                  Cancel order
                </Button>
              )}
              {verificationAction && (
                <Button
                  onClick={() => setPendingAction(verificationAction)}
                  variant="secondary"
                >
                  {verificationAction === 'reverse'
                    ? 'Reverse verification'
                    : 'Verify payment'}
                </Button>
              )}
            </div>
            {pendingAction && (
              <ConfirmationPanel
                action={pendingAction}
                reason={cancellationReason}
                setReason={setCancellationReason}
                loading={actionMutation.isPending}
                error={
                  actionMutation.isError
                    ? messageOf(actionMutation.error)
                    : undefined
                }
                onBack={() => setPendingAction(null)}
                onConfirm={() => actionMutation.mutate(pendingAction)}
              />
            )}
          </div>
        )
      ) : null}
    </Dialog>
  )
}

function DetailFacts({ order }: { order: AdminOrderDetail }) {
  const dateTime = (value: string) =>
    new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
  return (
    <dl className="order-detail__facts">
      <div>
        <dt>Source</dt>
        <dd>{order.source === 'ONLINE' ? 'Online order' : 'Manual order'}</dd>
      </div>
      <div>
        <dt>Created</dt>
        <dd>{dateTime(order.created_at)}</dd>
      </div>
      <div>
        <dt>Last edited</dt>
        <dd>{dateTime(order.last_edited_at)}</dd>
      </div>
      {order.verified_at && (
        <div>
          <dt>Verified</dt>
          <dd>{dateTime(order.verified_at)}</dd>
        </div>
      )}
      <div>
        <dt>Address</dt>
        <dd>{order.exact_address}</dd>
      </div>
      <div>
        <dt>Delivery area</dt>
        <dd>
          {order.location_classification === 'NEARBY'
            ? order.selected_area_name
            : 'Outside listed areas'}
        </dd>
      </div>
      {order.is_cancelled && (
        <>
          <div>
            <dt>Cancelled at</dt>
            <dd>
              {order.cancelled_at
                ? dateTime(order.cancelled_at)
                : 'Cancellation time unavailable'}
            </dd>
          </div>
          <div>
            <dt>Cancellation reason</dt>
            <dd>{order.cancellation_reason || 'No reason provided'}</dd>
          </div>
        </>
      )}
    </dl>
  )
}

function ConfirmationPanel({
  action,
  reason,
  setReason,
  loading,
  error,
  onBack,
  onConfirm,
}: {
  action: Exclude<PendingAction, null>
  reason: string
  setReason: (value: string) => void
  loading: boolean
  error?: string
  onBack: () => void
  onConfirm: () => void
}) {
  const labels = {
    cancel: 'Cancel this order?',
    restore: 'Restore this order?',
    verify: 'Mark payment as verified?',
    reverse: 'Reverse payment verification?',
  }
  return (
    <div
      className="order-confirm"
      role="alertdialog"
      aria-label={labels[action]}
    >
      <h3>{labels[action]}</h3>
      <p>
        This updates the trusted order record and today’s totals immediately.
      </p>
      {action === 'cancel' && (
        <Field htmlFor="cancellation-reason" label="Reason (optional)">
          <Textarea
            id="cancellation-reason"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button onClick={onBack} variant="ghost">
          Go back
        </Button>
        <Button
          loading={loading}
          onClick={onConfirm}
          variant={action === 'cancel' ? 'destructive' : 'primary'}
        >
          Confirm
        </Button>
      </div>
    </div>
  )
}

function EvidencePanel({ attachmentId }: { attachmentId: string }) {
  const [requested, setRequested] = useState(false)
  const image = useQuery({
    queryKey: ['admin-evidence', attachmentId],
    queryFn: () => getAdminEvidenceSignedUrl(attachmentId),
    enabled: requested,
    staleTime: 45_000,
  })
  return (
    <section className="order-evidence">
      <h3>Payment evidence</h3>
      {!requested ? (
        <Button onClick={() => setRequested(true)} variant="secondary">
          View private image
        </Button>
      ) : image.isPending ? (
        <LoadingState label="Opening private image…" />
      ) : image.isError ? (
        <ErrorState
          description={messageOf(image.error)}
          onRetry={() => void image.refetch()}
        />
      ) : (
        <img alt="Customer payment evidence" src={image.data} />
      )}
    </section>
  )
}

function OrderEditForm({
  order,
  businessDate,
  onCancel,
  onDirtyChange,
  onSaved,
}: {
  order: AdminOrderDetail
  businessDate: string
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string>()
  const { register, control, handleSubmit, watch, formState } =
    useForm<AdminOrderEditDraft>({ defaultValues: orderToEditDraft(order) })
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
    keyName: '_formKey',
  })
  const location = watch('locationClassification')
  const mutation = useMutation({
    mutationFn: editAdminOrder,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminOrderQueryKeys.list(businessDate),
        }),
        queryClient.invalidateQueries({
          queryKey: adminOrderQueryKeys.totals(businessDate),
        }),
        queryClient.invalidateQueries({
          queryKey: adminOrderQueryKeys.detail(order.id),
        }),
      ])
      onSaved()
    },
  })
  useEffect(
    () => onDirtyChange(formState.isDirty),
    [formState.isDirty, onDirtyChange],
  )
  const submit = handleSubmit((draft) => {
    const input = editDraftToTrustedInput(order.id, draft)
    if (!input) {
      setFormError(
        'Complete every required field and use valid non-negative item and delivery amounts.',
      )
      return
    }
    setFormError(undefined)
    mutation.mutate(input)
  })
  return (
    <form className="order-edit-form" onSubmit={submit}>
      <p className="trusted-note">
        <Icon name="lock" /> Delivery and order totals are recalculated by the
        backend. The original checkout snapshot remains unchanged.
      </p>
      <div className="order-edit-form__grid">
        <Field htmlFor="edit-customer" label="Customer name" required>
          <Input id="edit-customer" {...register('customerName')} />
        </Field>
        <Field htmlFor="edit-address" label="Exact address" required>
          <Textarea id="edit-address" {...register('exactAddress')} />
        </Field>
        <Field htmlFor="edit-location" label="Location" required>
          <Select id="edit-location" {...register('locationClassification')}>
            <option value="NEARBY">Nearby listed area</option>
            <option value="OUTSIDE">Outside listed areas</option>
          </Select>
        </Field>
        {location === 'NEARBY' && (
          <Field htmlFor="edit-area" label="Area name" required>
            <Input id="edit-area" {...register('selectedAreaName')} />
          </Field>
        )}
        <Field htmlFor="edit-payment" label="Payment" required>
          <Select id="edit-payment" {...register('paymentMethod')}>
            <option value="CASH">Cash</option>
            <option value="ONLINE_PAYMENT">Online payment</option>
          </Select>
        </Field>
      </div>
      <fieldset className="order-edit-delivery">
        <legend>Delivery rules for this order</legend>
        <p>
          Change the source values only when correcting this transaction. The
          backend will recalculate customer delivery, grand total, and rider
          amount.
        </p>
        <div className="order-edit-form__grid">
          <Field
            htmlFor="edit-delivery-threshold"
            label="Free base-delivery threshold (₱)"
          >
            <Input
              id="edit-delivery-threshold"
              inputMode="decimal"
              {...register('deliveryThresholdPesos')}
            />
          </Field>
          <Field
            htmlFor="edit-base-delivery"
            label="Base delivery below threshold (₱)"
          >
            <Input
              id="edit-base-delivery"
              inputMode="decimal"
              {...register('baseChargeBelowThresholdPesos')}
            />
          </Field>
          <Field htmlFor="edit-far-area" label="Outside-area charge (₱)">
            <Input
              id="edit-far-area"
              inputMode="decimal"
              {...register('farAreaRatePesos')}
            />
          </Field>
        </div>
      </fieldset>
      <section className="order-edit-items">
        <div className="order-edit-items__heading">
          <div>
            <h3>Order items</h3>
            <p>
              Names, prices, quantities, category, and internal DF can be
              corrected.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              append({
                id: createSecureUuid(),
                publishedMenuItemId: null,
                catalogItemId: null,
                name: '',
                category: 'ULAM',
                quantity: 1,
                unitPricePesos: '0.00',
                internalDfPesos: '0.00',
              })
            }
          >
            Add item
          </Button>
        </div>
        {fields.map((field, index) => (
          <fieldset className="order-edit-item" key={field._formKey}>
            <legend>Item {index + 1}</legend>
            <input type="hidden" {...register(`items.${index}.id`)} />
            <Field htmlFor={`item-${index}-name`} label="Name" required>
              <Input
                id={`item-${index}-name`}
                {...register(`items.${index}.name`)}
              />
            </Field>
            <Field htmlFor={`item-${index}-category`} label="Category">
              <Select
                id={`item-${index}-category`}
                {...register(`items.${index}.category`)}
              >
                <option value="ULAM">Ulam</option>
                <option value="DESSERTS">Desserts</option>
                <option value="EXTRAS">Extras</option>
              </Select>
            </Field>
            <Field htmlFor={`item-${index}-quantity`} label="Quantity">
              <Input
                id={`item-${index}-quantity`}
                type="number"
                min="1"
                step="1"
                {...register(`items.${index}.quantity`, {
                  valueAsNumber: true,
                })}
              />
            </Field>
            <Field htmlFor={`item-${index}-price`} label="Unit price (₱)">
              <Input
                id={`item-${index}-price`}
                inputMode="decimal"
                {...register(`items.${index}.unitPricePesos`)}
              />
            </Field>
            <Field htmlFor={`item-${index}-df`} label="Internal DF / unit (₱)">
              <Input
                id={`item-${index}-df`}
                inputMode="decimal"
                {...register(`items.${index}.internalDfPesos`)}
              />
            </Field>
            <Button
              disabled={fields.length === 1}
              type="button"
              variant="ghost"
              onClick={() => remove(index)}
            >
              Remove
            </Button>
          </fieldset>
        ))}
      </section>
      {(formError || mutation.isError) && (
        <p className="form-error" role="alert">
          {formError || messageOf(mutation.error)}
        </p>
      )}
      <div className="order-edit-form__actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Discard changes
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          Save trusted changes
        </Button>
      </div>
    </form>
  )
}
