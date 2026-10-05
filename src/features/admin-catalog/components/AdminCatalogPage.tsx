import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminPageHeader } from '../../../components/layout/AdminPageHeader'
import { AppBackground, PageContainer } from '../../../components/layout/Page'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../../components/ui/Feedback'
import { Field, Input, Select } from '../../../components/ui/FormControls'
import { Icon } from '../../../components/ui/Icon'
import { formatPeso } from '../../../lib/format-money'
import { pesoInputToCentavos } from '../../../lib/money-input'
import { publicAssetUrl } from '../../../lib/public-asset-url'
import { createSecureUuid } from '../../../lib/secure-random-uuid'
import { useAdminSession } from '../../admin-auth'
import {
  createCatalogItem,
  listAdminCatalog,
  setCatalogItemArchived,
  updateCatalogItem,
  uploadCatalogPhoto,
} from '../api/admin-catalog'
import {
  catalogDraftToInput,
  catalogItemToDraft,
  catalogQueryKey,
  filterCatalogItems,
  validateCatalogImage,
  type CatalogDraft,
} from '../model'
import {
  CATALOG_CATEGORIES,
  type ArchiveFilter,
  type CatalogCategory,
  type CatalogItem,
} from '../types'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}

export function AdminCatalogPage() {
  const queryClient = useQueryClient()
  const { signOut } = useAdminSession()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CatalogCategory | 'ALL'>('ALL')
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('ACTIVE')
  const [editingItem, setEditingItem] = useState<CatalogItem | null>()
  const [formDirty, setFormDirty] = useState(false)
  const [archiveItem, setArchiveItem] = useState<CatalogItem | null>(null)
  const [notice, setNotice] = useState<string>()

  const catalog = useQuery({
    queryKey: catalogQueryKey,
    queryFn: listAdminCatalog,
    staleTime: 60_000,
  })
  const items = useMemo(
    () =>
      filterCatalogItems(catalog.data ?? [], search, category, archiveFilter),
    [archiveFilter, catalog.data, category, search],
  )
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setCatalogItemArchived(id, archived),
    onSuccess: async (item) => {
      setArchiveItem(null)
      setNotice(
        item.isArchived
          ? `${item.name} was archived. Past menus and orders are unchanged.`
          : `${item.name} was restored to the active catalog.`,
      )
      await queryClient.invalidateQueries({ queryKey: catalogQueryKey })
    },
  })

  function closeForm() {
    if (formDirty && !window.confirm('Discard your unsaved food changes?'))
      return
    setEditingItem(undefined)
    setFormDirty(false)
  }

  const emptyTitle =
    archiveFilter === 'ARCHIVED'
      ? 'No archived food items'
      : search || category !== 'ALL'
        ? 'No matching food items'
        : 'No food items yet'

  return (
    <AppBackground className="admin-background admin-catalog-background">
      <AdminPageHeader onLogout={signOut} subtitle="ULAM PHOTOS" />
      <main>
        <PageContainer className="admin-catalog-shell">
          <header className="catalog-page-heading">
            <div>
              <p className="eyebrow">Reusable food library</p>
              <h1>ULAM PHOTOS</h1>
              <p>
                Keep each food’s photo, price, category, and internal delivery
                allocation ready for future menus.
              </p>
            </div>
            <Button
              icon="plus"
              onClick={() => {
                setNotice(undefined)
                setEditingItem(null)
              }}
              size="large"
            >
              Add food
            </Button>
          </header>

          {notice && (
            <p className="action-notice" role="status">
              <Icon name="check" /> {notice}
            </p>
          )}

          <section className="catalog-controls" aria-label="Catalog filters">
            <label className="orders-search">
              <span>Search food name</span>
              <Input
                type="search"
                placeholder="Search food"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div>
              <span className="catalog-filter-label">Category</span>
              <div className="catalog-filter-buttons">
                {(['ALL', ...CATALOG_CATEGORIES] as const).map((value) => (
                  <button
                    aria-pressed={category === value}
                    key={value}
                    onClick={() => setCategory(value)}
                    type="button"
                  >
                    {value === 'ALL' ? 'All' : value}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="catalog-filter-label">Availability</span>
              <div className="catalog-filter-buttons">
                {(['ACTIVE', 'ARCHIVED', 'ALL'] as const).map((value) => (
                  <button
                    aria-pressed={archiveFilter === value}
                    key={value}
                    onClick={() => setArchiveFilter(value)}
                    type="button"
                  >
                    {value === 'ALL'
                      ? 'All'
                      : value === 'ACTIVE'
                        ? 'Active'
                        : 'Archived'}
                  </button>
                ))}
              </div>
            </div>
            <Button
              loading={catalog.isFetching}
              onClick={() => void catalog.refetch()}
              variant="secondary"
            >
              Refresh
            </Button>
          </section>

          {catalog.isPending ? (
            <div className="catalog-grid" aria-label="Loading food catalog">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton className="catalog-card-skeleton" key={index} />
              ))}
            </div>
          ) : catalog.isError ? (
            <ErrorState
              description={messageOf(catalog.error)}
              onRetry={() => void catalog.refetch()}
            />
          ) : items.length ? (
            <div className="catalog-grid">
              {items.map((item) => (
                <CatalogCard
                  item={item}
                  key={item.id}
                  onArchive={() => setArchiveItem(item)}
                  onEdit={() => {
                    setNotice(undefined)
                    setEditingItem(item)
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              action={
                archiveFilter !== 'ARCHIVED' && !search ? (
                  <Button onClick={() => setEditingItem(null)}>Add food</Button>
                ) : undefined
              }
              icon="chef-hat"
              title={emptyTitle}
              description={
                archiveFilter === 'ARCHIVED'
                  ? 'Archived food will appear here.'
                  : search || category !== 'ALL'
                    ? 'Try a different name or category.'
                    : 'Add the first reusable food item for future menus.'
              }
            />
          )}
        </PageContainer>
      </main>

      <Dialog
        open={editingItem !== undefined}
        onOpenChange={(open) => !open && closeForm()}
        title={editingItem ? `Edit ${editingItem.name}` : 'Add food'}
        description="Photo, price, and Internal DF are saved for future menu publishing."
      >
        {editingItem !== undefined && (
          <CatalogForm
            item={editingItem}
            key={editingItem?.id ?? 'new'}
            onCancel={closeForm}
            onDirtyChange={setFormDirty}
            onSaved={async (item) => {
              setEditingItem(undefined)
              setFormDirty(false)
              setNotice(
                editingItem
                  ? `${item.name} was updated successfully.`
                  : `${item.name} was added to ULAM PHOTOS.`,
              )
              await queryClient.invalidateQueries({ queryKey: catalogQueryKey })
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={Boolean(archiveItem)}
        onOpenChange={(open) => !open && setArchiveItem(null)}
        title={
          archiveItem?.isArchived
            ? 'Restore this food item?'
            : 'Archive this food item?'
        }
        description={
          archiveItem?.isArchived
            ? 'It will become available for future menu publishing again.'
            : 'It will no longer be available for future menus. Past menus and orders are not deleted.'
        }
      >
        {archiveMutation.isError && (
          <p className="form-error" role="alert">
            {messageOf(archiveMutation.error)}
          </p>
        )}
        <div className="catalog-confirm-actions">
          <Button onClick={() => setArchiveItem(null)} variant="ghost">
            Go back
          </Button>
          <Button
            loading={archiveMutation.isPending}
            onClick={() =>
              archiveItem &&
              archiveMutation.mutate({
                id: archiveItem.id,
                archived: !archiveItem.isArchived,
              })
            }
            variant={archiveItem?.isArchived ? 'primary' : 'destructive'}
          >
            {archiveItem?.isArchived ? 'Restore' : 'Archive'}
          </Button>
        </div>
      </Dialog>
    </AppBackground>
  )
}

function CatalogCard({
  item,
  onEdit,
  onArchive,
}: {
  item: CatalogItem
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <article
      className={`catalog-card${item.isArchived ? ' catalog-card--archived' : ''}`}
    >
      <CatalogImage item={item} />
      <div className="catalog-card__body">
        <div className="catalog-card__heading">
          <div>
            <Badge variant="info">{item.category}</Badge>
            {item.isArchived && <Badge variant="cancelled">Archived</Badge>}
          </div>
          <h2>{item.name}</h2>
        </div>
        <dl>
          <div>
            <dt>Price</dt>
            <dd>{formatPeso(item.priceCentavos)}</dd>
          </div>
          <div>
            <dt>Internal DF</dt>
            <dd>{formatPeso(item.internalDfCentavos)}</dd>
          </div>
        </dl>
        <p className="catalog-card__internal-note">
          Internal amount only. Customers do not see this value.
        </p>
        <div className="catalog-card__actions">
          <Button onClick={onEdit} variant="secondary">
            Edit
          </Button>
          <Button
            onClick={onArchive}
            variant={item.isArchived ? 'secondary' : 'ghost'}
          >
            {item.isArchived ? 'Restore' : 'Archive'}
          </Button>
        </div>
      </div>
    </article>
  )
}

function CatalogImage({ item }: { item: CatalogItem }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <div
      className="catalog-card__image-fallback"
      role="img"
      aria-label={`Photo unavailable for ${item.name}`}
    >
      <Icon name="image" />
      <span>Photo unavailable</span>
    </div>
  ) : (
    <img
      className="catalog-card__image"
      src={publicAssetUrl(item.photoPath)}
      alt={item.name}
      onError={() => setFailed(true)}
    />
  )
}

function CatalogForm({
  item,
  onCancel,
  onDirtyChange,
  onSaved,
}: {
  item: CatalogItem | null
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
  onSaved: (item: CatalogItem) => Promise<void>
}) {
  const itemId = useRef(item?.id ?? createSecureUuid()).current
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string>()
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    item ? publicAssetUrl(item.photoPath) : null,
  )
  const { register, handleSubmit, formState } = useForm<CatalogDraft>({
    defaultValues: item
      ? catalogItemToDraft(item)
      : { name: '', category: 'ULAM', pricePesos: '', internalDfPesos: '' },
  })

  useEffect(
    () => onDirtyChange(formState.isDirty || Boolean(photo)),
    [formState.isDirty, onDirtyChange, photo],
  )
  useEffect(() => {
    if (!photo) return
    const url = URL.createObjectURL(photo)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const saveMutation = useMutation({
    mutationFn: async (draft: CatalogDraft) => {
      if (!item && !photo) throw new Error('Choose a food photo.')
      const imageError = photo ? validateCatalogImage(photo) : null
      if (imageError) throw new Error(imageError)
      const photoPath = photo
        ? await uploadCatalogPhoto(itemId, photo)
        : undefined
      const input = catalogDraftToInput(itemId, draft, photoPath)
      if (!input)
        throw new Error('Check the name, price, and Internal DF values.')
      return item ? updateCatalogItem(input) : createCatalogItem(input)
    },
    onSuccess: onSaved,
  })

  const submit = handleSubmit((draft) => saveMutation.mutate(draft))
  return (
    <form className="catalog-form" onSubmit={submit}>
      <div className="catalog-photo-field">
        <span className="label">Food photo *</span>
        <div className="catalog-photo-preview">
          {previewUrl ? (
            <img alt="Selected food preview" src={previewUrl} />
          ) : (
            <div>
              <Icon name="image" />
              <span>Add a clear food photo</span>
            </div>
          )}
        </div>
        <label
          className="button button--secondary button--default"
          htmlFor="catalog-photo"
        >
          <Icon name="camera" />
          <span>{previewUrl ? 'Choose replacement' : 'Choose photo'}</span>
        </label>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="visually-hidden"
          id="catalog-photo"
          type="file"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null
            if (!next) return
            const error = validateCatalogImage(next)
            setPhotoError(error ?? undefined)
            if (!error) setPhoto(next)
            event.target.value = ''
          }}
        />
        {photo && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPhoto(null)
              setPreviewUrl(item ? publicAssetUrl(item.photoPath) : null)
              setPhotoError(undefined)
            }}
          >
            Remove selected photo
          </Button>
        )}
        <p className="field__description">
          JPEG, PNG, or WebP · maximum 5 MiB. Gallery and camera-supported
          pickers are allowed.
        </p>
        {photoError && (
          <p className="field__error" role="alert">
            {photoError}
          </p>
        )}
      </div>

      <Field
        htmlFor="catalog-name"
        label="Food name"
        required
        error={formState.errors.name?.message}
      >
        <Input
          id="catalog-name"
          {...register('name', {
            required: 'Enter a food name.',
            maxLength: { value: 160, message: 'Use 160 characters or fewer.' },
          })}
        />
      </Field>
      <Field htmlFor="catalog-category" label="Category" required>
        <Select
          id="catalog-category"
          {...register('category', { required: true })}
        >
          {CATALOG_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        htmlFor="catalog-price"
        label="Price (₱)"
        required
        error={formState.errors.pricePesos?.message}
      >
        <Input
          id="catalog-price"
          inputMode="decimal"
          placeholder="85.00"
          {...register('pricePesos', {
            required: 'Enter the customer price.',
            validate: (value) => {
              const amount = pesoInputToCentavos(value)
              return (
                (amount !== null && amount >= 0) ||
                'Enter a valid non-negative amount with up to two decimals.'
              )
            },
          })}
        />
      </Field>
      <Field
        htmlFor="catalog-internal-df"
        label="Internal Delivery Allocation (₱)"
        required
        description="Internal amount used by the delivery calculation. Customers do not see this."
        error={formState.errors.internalDfPesos?.message}
      >
        <Input
          id="catalog-internal-df"
          inputMode="decimal"
          placeholder="10.00"
          {...register('internalDfPesos', {
            required: 'Enter Internal DF. Zero is allowed.',
            validate: (value) => {
              const amount = pesoInputToCentavos(value)
              return (
                (amount !== null && amount >= 0) ||
                'Enter a valid non-negative amount with up to two decimals.'
              )
            },
          })}
        />
      </Field>
      {saveMutation.isError && (
        <p className="form-error" role="alert">
          {messageOf(saveMutation.error)}
        </p>
      )}
      <div className="catalog-form__actions">
        <Button type="button" onClick={onCancel} variant="ghost">
          Discard
        </Button>
        <Button type="submit" loading={saveMutation.isPending}>
          Save food
        </Button>
      </div>
    </form>
  )
}
