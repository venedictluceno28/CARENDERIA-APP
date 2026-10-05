import { useMemo, useState } from 'react'
import {
  useFieldArray,
  useForm,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AdminPageHeader } from '../../../components/layout/AdminPageHeader'
import { AppBackground, PageContainer } from '../../../components/layout/Page'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../../components/ui/Feedback'
import {
  ChoiceCard,
  Field,
  Input,
  Select,
  Textarea,
} from '../../../components/ui/FormControls'
import { Icon } from '../../../components/ui/Icon'
import {
  adminOrderQueryKeys,
  currentManilaBusinessDate,
} from '../../../lib/admin-order-queries.ts'
import { NEARBY_AREAS } from '../../../lib/delivery-areas.ts'
import { formatPeso } from '../../../lib/format-money.ts'
import { MENU_CATEGORIES } from '../../../lib/menu-category.ts'
import { useAdminSession } from '../../admin-auth'
import { AddressBookPicker } from '../../admin-address-book'
import {
  createManualOrder,
  getManualOrderSettings,
  listManualOrderCatalog,
} from '../api/admin-manual-order.ts'
import {
  calculateManualOrderPreview,
  catalogItemToManualDraft,
  emptyManualItem,
  manualOrderDraftToInput,
  manualOrderQueryKey,
  manualOrderSettingsQueryKey,
  savedAddressToManualCustomer,
} from '../model.ts'
import type {
  ManualOrderDraft,
  ManualOrderItemDraft,
  ManualOrderResult,
} from '../types.ts'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}

const defaultDraft = (): ManualOrderDraft => ({
  customerName: '',
  exactAddress: '',
  deliveryArea: '',
  paymentMethod: 'CASH',
  items: [emptyManualItem()],
})

type SuccessDetails = ManualOrderResult & {
  customerName: string
  paymentMethod: ManualOrderDraft['paymentMethod']
}

export function AdminManualOrderPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { signOut } = useAdminSession()
  const [success, setSuccess] = useState<SuccessDetails>()
  const [catalogSearch, setCatalogSearch] = useState('')
  const form = useForm<ManualOrderDraft>({ defaultValues: defaultDraft() })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
    keyName: 'fieldKey',
  })
  const watched = form.watch()
  const input = useMemo(() => manualOrderDraftToInput(watched), [watched])

  const catalog = useQuery({
    queryKey: manualOrderQueryKey,
    queryFn: listManualOrderCatalog,
    staleTime: 60_000,
  })
  const settings = useQuery({
    queryKey: manualOrderSettingsQueryKey,
    queryFn: getManualOrderSettings,
    staleTime: 5 * 60_000,
  })
  const preview =
    input && settings.data
      ? calculateManualOrderPreview(input, settings.data)
      : null
  const shownCatalog = useMemo(() => {
    const search = catalogSearch.trim().toLocaleLowerCase()
    return (catalog.data ?? []).filter(
      (item) => !search || item.name.toLocaleLowerCase().includes(search),
    )
  }, [catalog.data, catalogSearch])
  const businessDate = currentManilaBusinessDate()

  const mutation = useMutation({
    mutationFn: createManualOrder,
    onSuccess: async (result, submitted) => {
      setSuccess({
        ...result,
        customerName: submitted.customerName,
        paymentMethod: submitted.paymentMethod,
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminOrderQueryKeys.list(businessDate),
        }),
        queryClient.invalidateQueries({
          queryKey: adminOrderQueryKeys.totals(businessDate),
        }),
      ])
    },
    onError: async () => {
      // The RPC has no idempotency key. Reconcile today's list if the response
      // was lost before suggesting that the owner submit again.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminOrderQueryKeys.list(businessDate),
        }),
        queryClient.invalidateQueries({
          queryKey: adminOrderQueryKeys.totals(businessDate),
        }),
      ])
    },
  })

  async function submit(draft: ManualOrderDraft) {
    const trustedInput = manualOrderDraftToInput(draft)
    if (!trustedInput) {
      form.setError('root', {
        message: 'Review the customer, delivery area, and every order item.',
      })
      return
    }
    form.clearErrors('root')
    mutation.mutate(trustedInput)
  }

  function createAnother() {
    setSuccess(undefined)
    setCatalogSearch('')
    mutation.reset()
    form.reset(defaultDraft())
  }

  return (
    <AppBackground className="admin-background manual-order-background">
      <AdminPageHeader onLogout={signOut} subtitle="MANUAL ORDER" />
      <main>
        <PageContainer className="manual-order-shell">
          {success ? (
            <ManualOrderSuccess
              details={success}
              onAnother={createAnother}
              onView={() => navigate('/admin/orders')}
            />
          ) : (
            <>
              <header className="manual-order-heading">
                <p className="eyebrow">Off-platform orders</p>
                <h1>MANUAL ORDER</h1>
                <p>
                  Record phone, Messenger, walk-in, or other external orders in
                  the same trusted system as online checkout.
                </p>
              </header>

              <form
                className="manual-order-form"
                onSubmit={form.handleSubmit(submit)}
              >
                <section
                  className="manual-order-section"
                  aria-labelledby="manual-customer-title"
                >
                  <div className="manual-order-section__heading">
                    <span>1</span>
                    <div>
                      <h2 id="manual-customer-title">Customer</h2>
                      <p>Name and exact delivery address.</p>
                    </div>
                  </div>
                  <div className="manual-address-book-assist">
                    <AddressBookPicker
                      onSelect={(entry) => {
                        const copied = savedAddressToManualCustomer(entry)
                        form.setValue('customerName', copied.customerName, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                        form.setValue('exactAddress', copied.exactAddress, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                        form.clearErrors(['customerName', 'exactAddress'])
                      }}
                    />
                    <p>
                      Optional. The selected details are copied into this order
                      and can still be changed here.
                    </p>
                  </div>
                  <div className="manual-order-fields">
                    <Field
                      error={form.formState.errors.customerName?.message}
                      htmlFor="manual-customer-name"
                      label="Customer name"
                      required
                    >
                      <Input
                        id="manual-customer-name"
                        autoComplete="name"
                        maxLength={160}
                        {...form.register('customerName', {
                          required: 'Enter the customer name.',
                          validate: (value) =>
                            value.trim().length > 0 ||
                            'Enter the customer name.',
                        })}
                      />
                    </Field>
                    <Field
                      error={form.formState.errors.exactAddress?.message}
                      htmlFor="manual-exact-address"
                      label="Exact address"
                      required
                    >
                      <Textarea
                        id="manual-exact-address"
                        autoComplete="street-address"
                        maxLength={1000}
                        rows={3}
                        {...form.register('exactAddress', {
                          required: 'Enter the exact address.',
                          validate: (value) =>
                            value.trim().length > 0 ||
                            'Enter the exact address.',
                        })}
                      />
                    </Field>
                    <Field
                      error={form.formState.errors.deliveryArea?.message}
                      htmlFor="manual-delivery-area"
                      label="Delivery area"
                      required
                    >
                      <Select
                        id="manual-delivery-area"
                        {...form.register('deliveryArea', {
                          required: 'Choose the delivery area.',
                        })}
                      >
                        <option value="">Choose area</option>
                        {NEARBY_AREAS.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                        <option value="OUTSIDE">Outside these areas</option>
                      </Select>
                    </Field>
                  </div>
                </section>

                <CatalogAssist
                  error={catalog.error}
                  isPending={catalog.isPending}
                  items={shownCatalog}
                  onAdd={(item) => append(catalogItemToManualDraft(item))}
                  onRetry={() => void catalog.refetch()}
                  onSearch={setCatalogSearch}
                  search={catalogSearch}
                />

                <section
                  className="manual-order-section"
                  aria-labelledby="manual-items-title"
                >
                  <div className="manual-order-section__heading">
                    <span>3</span>
                    <div>
                      <h2 id="manual-items-title">Order items</h2>
                      <p>Edit catalog defaults or enter any custom item.</p>
                    </div>
                  </div>
                  <div className="manual-item-list">
                    {fields.map((field, index) => (
                      <ManualItemCard
                        errors={form.formState.errors.items?.[index]}
                        index={index}
                        key={field.fieldKey}
                        register={form.register}
                        onRemove={() => remove(index)}
                      />
                    ))}
                  </div>
                  {!fields.length && (
                    <p className="field__error" role="alert">
                      Add at least one order item.
                    </p>
                  )}
                  <Button
                    icon="plus"
                    onClick={() => append(emptyManualItem())}
                    type="button"
                    variant="secondary"
                  >
                    Add custom item
                  </Button>
                </section>

                <section
                  className="manual-order-section"
                  aria-labelledby="manual-payment-title"
                >
                  <div className="manual-order-section__heading">
                    <span>4</span>
                    <div>
                      <h2 id="manual-payment-title">Payment</h2>
                      <p>Online payments begin Not Verified.</p>
                    </div>
                  </div>
                  <div className="manual-payment-options">
                    <ChoiceCard
                      label="Cash"
                      description="No verification status"
                      value="CASH"
                      {...form.register('paymentMethod')}
                    />
                    <ChoiceCard
                      label="Online Payment"
                      description="Starts Not Verified"
                      value="ONLINE_PAYMENT"
                      {...form.register('paymentMethod')}
                    />
                  </div>
                </section>

                <OrderReview
                  draft={watched}
                  preview={preview}
                  settingsError={settings.error}
                />

                {(form.formState.errors.root || mutation.isError) && (
                  <div className="manual-order-submit-error" role="alert">
                    <strong>The order was not created.</strong>
                    <p>
                      {form.formState.errors.root?.message ??
                        `${messageOf(mutation.error)} Check Today’s Orders before submitting again if the network response was interrupted.`}
                    </p>
                  </div>
                )}

                <div className="manual-order-submit">
                  <div>
                    <strong>
                      {preview
                        ? `Estimated total ${formatPeso(preview.grandTotalCentavos)}`
                        : 'Complete the form to review totals'}
                    </strong>
                    <small>
                      Final totals are calculated by the trusted backend.
                    </small>
                  </div>
                  <Button
                    disabled={mutation.isPending}
                    loading={mutation.isPending}
                    size="large"
                    type="submit"
                  >
                    Save order
                  </Button>
                </div>
              </form>
            </>
          )}
        </PageContainer>
      </main>
    </AppBackground>
  )
}

function CatalogAssist({
  error,
  isPending,
  items,
  onAdd,
  onRetry,
  onSearch,
  search,
}: {
  error: unknown
  isPending: boolean
  items: Awaited<ReturnType<typeof listManualOrderCatalog>>
  onAdd: (
    item: Awaited<ReturnType<typeof listManualOrderCatalog>>[number],
  ) => void
  onRetry: () => void
  onSearch: (value: string) => void
  search: string
}) {
  return (
    <section
      className="manual-order-section"
      aria-labelledby="manual-catalog-title"
    >
      <div className="manual-order-section__heading">
        <span>2</span>
        <div>
          <h2 id="manual-catalog-title">Quick add from ULAM PHOTOS</h2>
          <p>Optional convenience. Custom items remain available below.</p>
        </div>
      </div>
      <label className="orders-search">
        <span>Search active catalog</span>
        <Input
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search food"
          type="search"
          value={search}
        />
      </label>
      {isPending ? (
        <div className="manual-catalog-grid">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton className="manual-catalog-skeleton" key={index} />
          ))}
        </div>
      ) : error ? (
        <ErrorState description={messageOf(error)} onRetry={onRetry} />
      ) : items.length ? (
        <div className="manual-catalog-grid">
          {items.map((item) => (
            <button
              className="manual-catalog-item"
              key={item.id}
              onClick={() => onAdd(item)}
              type="button"
            >
              <span>
                <strong>{item.name}</strong>
                <small>{item.category}</small>
              </span>
              <span>
                {formatPeso(item.priceCentavos)} · DF{' '}
                {formatPeso(item.internalDfCentavos)}
              </span>
              <span className="manual-catalog-item__action">
                <Icon name="plus" /> Add
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Enter a custom item below or change your search."
          icon="shopping-bag"
          title="No matching catalog food"
        />
      )}
    </section>
  )
}

function ManualItemCard({
  index,
  errors,
  register,
  onRemove,
}: {
  index: number
  errors?: FieldErrors<ManualOrderItemDraft>
  register: UseFormRegister<ManualOrderDraft>
  onRemove: () => void
}) {
  return (
    <article className="manual-item-card">
      <header>
        <div>
          <Badge variant="info">Item {index + 1}</Badge>
          <h3>Food details</h3>
        </div>
        <Button
          aria-label={`Remove item ${index + 1}`}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon name="x" />
        </Button>
      </header>
      <div className="manual-item-fields">
        <Field
          error={errors?.name?.message}
          htmlFor={`manual-item-${index}-name`}
          label="Item name"
          required
        >
          <Input
            id={`manual-item-${index}-name`}
            maxLength={160}
            {...register(`items.${index}.name`, {
              required: 'Enter an item name.',
              validate: (value) =>
                value.trim().length > 0 || 'Enter an item name.',
            })}
          />
        </Field>
        <Field
          error={errors?.category?.message}
          htmlFor={`manual-item-${index}-category`}
          label="Category"
          required
        >
          <Select
            id={`manual-item-${index}-category`}
            {...register(`items.${index}.category`, { required: true })}
          >
            {MENU_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={errors?.quantity?.message}
          htmlFor={`manual-item-${index}-quantity`}
          label="Quantity"
          required
        >
          <Input
            id={`manual-item-${index}-quantity`}
            inputMode="numeric"
            min="1"
            step="1"
            type="number"
            {...register(`items.${index}.quantity`, {
              valueAsNumber: true,
              required: 'Enter a quantity.',
              min: { value: 1, message: 'Quantity must be at least 1.' },
              validate: (value) =>
                Number.isInteger(value) || 'Use a whole-number quantity.',
            })}
          />
        </Field>
        <Field
          error={errors?.unitPricePesos?.message}
          htmlFor={`manual-item-${index}-price`}
          label="Unit price (₱)"
          required
        >
          <Input
            id={`manual-item-${index}-price`}
            inputMode="decimal"
            placeholder="85.00"
            {...register(`items.${index}.unitPricePesos`, {
              required: 'Enter the unit price.',
              pattern: {
                value: /^\d+(?:\.\d{1,2})?$/u,
                message: 'Use pesos with up to 2 decimal places.',
              },
            })}
          />
        </Field>
        <Field
          description="Used for delivery/rider calculation. Customer does not see this."
          error={errors?.internalDfPesos?.message}
          htmlFor={`manual-item-${index}-df`}
          label="Internal DF (₱)"
          required
        >
          <Input
            id={`manual-item-${index}-df`}
            inputMode="decimal"
            placeholder="10.00"
            {...register(`items.${index}.internalDfPesos`, {
              required: 'Enter Internal DF. Zero is allowed.',
              pattern: {
                value: /^\d+(?:\.\d{1,2})?$/u,
                message: 'Use pesos with up to 2 decimal places.',
              },
            })}
          />
        </Field>
      </div>
    </article>
  )
}

function OrderReview({
  draft,
  preview,
  settingsError,
}: {
  draft: ManualOrderDraft
  preview: ReturnType<typeof calculateManualOrderPreview>
  settingsError: unknown
}) {
  return (
    <section
      className="manual-order-section manual-order-review"
      aria-labelledby="manual-review-title"
    >
      <div className="manual-order-section__heading">
        <span>5</span>
        <div>
          <h2 id="manual-review-title">Review</h2>
          <p>Preview only. The backend recalculates every saved total.</p>
        </div>
      </div>
      <dl className="manual-review-facts">
        <div>
          <dt>Customer</dt>
          <dd>{draft.customerName.trim() || 'Not entered'}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>
            {draft.deliveryArea === 'OUTSIDE'
              ? 'Outside nearby areas'
              : draft.deliveryArea || 'Not selected'}
          </dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>{draft.paymentMethod === 'CASH' ? 'Cash' : 'Online Payment'}</dd>
        </div>
        <div>
          <dt>Items</dt>
          <dd>{draft.items.length}</dd>
        </div>
      </dl>
      {preview ? (
        <dl className="manual-review-totals">
          <div>
            <dt>Food subtotal</dt>
            <dd>{formatPeso(preview.foodSubtotalCentavos)}</dd>
          </div>
          <div>
            <dt>Internal DF total</dt>
            <dd>{formatPeso(preview.internalDfTotalCentavos)}</dd>
          </div>
          <div>
            <dt>Base delivery</dt>
            <dd>{formatPeso(preview.baseDeliveryChargeCentavos)}</dd>
          </div>
          <div>
            <dt>Outside-area charge</dt>
            <dd>{formatPeso(preview.farAreaChargeCentavos)}</dd>
          </div>
          <div>
            <dt>Customer delivery</dt>
            <dd>{formatPeso(preview.customerDeliveryChargeCentavos)}</dd>
          </div>
          <div className="manual-review-total--grand">
            <dt>Estimated grand total</dt>
            <dd>{formatPeso(preview.grandTotalCentavos)}</dd>
          </div>
          <div>
            <dt>Estimated rider</dt>
            <dd>{formatPeso(preview.calculatedRiderCentavos)}</dd>
          </div>
        </dl>
      ) : (
        <p className="manual-review-pending">
          {settingsError
            ? 'Preview unavailable. Trusted totals will still be calculated when saved.'
            : 'Complete all required fields to see the totals preview.'}
        </p>
      )}
    </section>
  )
}

function ManualOrderSuccess({
  details,
  onAnother,
  onView,
}: {
  details: SuccessDetails
  onAnother: () => void
  onView: () => void
}) {
  return (
    <section className="manual-order-success" role="status">
      <span className="manual-order-success__icon">
        <Icon name="check" />
      </span>
      <p className="eyebrow">Order created</p>
      <h1>{details.orderCode}</h1>
      <p>
        The manual order is now included in Today’s Orders, sales, delivery, and
        rider totals.
      </p>
      <dl>
        <div>
          <dt>Customer</dt>
          <dd>{details.customerName}</dd>
        </div>
        <div>
          <dt>Grand total</dt>
          <dd>{formatPeso(details.grandTotalCentavos)}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>
            {details.paymentMethod === 'CASH'
              ? 'Cash'
              : 'Online Payment · Not Verified'}
          </dd>
        </div>
      </dl>
      <div className="manual-order-success__actions">
        <Button onClick={onView} size="large">
          View in Today’s Orders
        </Button>
        <Button onClick={onAnother} size="large" variant="secondary">
          Create another order
        </Button>
      </div>
    </section>
  )
}
