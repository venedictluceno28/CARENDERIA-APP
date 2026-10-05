import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
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
import { Icon } from '../../../components/ui/Icon'
import { formatPeso } from '../../../lib/format-money'
import { customerActiveMenuQueryKey } from '../../../lib/query-keys.ts'
import { publicAssetUrl } from '../../../lib/public-asset-url'
import { createSecureUuid } from '../../../lib/secure-random-uuid'
import { useAdminSession } from '../../admin-auth'
import {
  deactivateMenu,
  getAdminActiveMenu,
  listMenuCatalog,
  publishMenu,
  setMenuItemSoldOut,
} from '../api/admin-menu'
import {
  adminMenuQueryKeys,
  catalogByCategory,
  customerPreviewItems,
  formatManilaDateTime,
  isValidPublishSelection,
  toggleMenuSelection,
  validateMenuImage,
} from '../model'
import type { AdminActiveMenu, AdminMenuItem, MenuCatalogItem } from '../types'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}

function AdminMenuImage({
  src,
  alt,
  className = '',
}: {
  src: string
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  return (
    <div className={`admin-menu-image ${className}`.trim()}>
      {failed ? (
        <span role="img" aria-label={`${alt} image unavailable`}>
          <Icon name="image" />
          <small>Image unavailable</small>
        </span>
      ) : (
        <img src={src} alt={alt} onError={() => setFailed(true)} />
      )}
    </div>
  )
}

export function AdminMenuPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { signOut } = useAdminSession()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [menuImage, setMenuImage] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string>()
  const [selectionError, setSelectionError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)

  const activeMenu = useQuery({
    queryKey: adminMenuQueryKeys.active,
    queryFn: getAdminActiveMenu,
    staleTime: 30_000,
  })
  const catalog = useQuery({
    queryKey: adminMenuQueryKeys.catalog,
    queryFn: listMenuCatalog,
    staleTime: 60_000,
  })
  const groupedCatalog = useMemo(
    () => catalogByCategory(catalog.data ?? []),
    [catalog.data],
  )
  const previewUrl = useMemo(
    () => (menuImage ? URL.createObjectURL(menuImage) : undefined),
    [menuImage],
  )
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  async function refreshMenuState() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminMenuQueryKeys.active }),
      queryClient.invalidateQueries({ queryKey: adminMenuQueryKeys.catalog }),
      queryClient.invalidateQueries({ queryKey: customerActiveMenuQueryKey }),
    ])
  }

  const publishMutation = useMutation({
    mutationFn: async () => {
      const imageProblem = validateMenuImage(menuImage)
      const validSelection = isValidPublishSelection(
        selectedIds,
        catalog.data ?? [],
      )
      setImageError(imageProblem ?? undefined)
      setSelectionError(
        validSelection ? undefined : 'Select at least one available food item.',
      )
      if (imageProblem || !validSelection || !menuImage)
        throw new Error('Review the menu image and selected food items.')
      return publishMenu(createSecureUuid(), selectedIds, menuImage)
    },
    onSuccess: async () => {
      setSelectedIds([])
      setMenuImage(null)
      setNotice('Today’s menu was published for up to 24 hours.')
      await refreshMenuState()
    },
    onError: async () => {
      // A lost response can make the outcome uncertain; always reconcile first.
      await queryClient.invalidateQueries({
        queryKey: adminMenuQueryKeys.active,
      })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (menuId: string) => deactivateMenu(menuId),
    onSuccess: async () => {
      setDeactivateOpen(false)
      setPreviewOpen(false)
      setNotice(
        'The menu was deactivated. Its history and orders are preserved.',
      )
      await refreshMenuState()
    },
  })

  const availabilityMutation = useMutation({
    mutationFn: ({ itemId, soldOut }: { itemId: string; soldOut: boolean }) =>
      setMenuItemSoldOut(itemId, soldOut),
    onSuccess: async (_, variables) => {
      setNotice(
        variables.soldOut
          ? 'The food item is now SOLD OUT for this menu.'
          : 'The food item is available again for this menu.',
      )
      await refreshMenuState()
    },
  })

  const busy =
    publishMutation.isPending ||
    deactivateMutation.isPending ||
    availabilityMutation.isPending

  return (
    <AppBackground className="admin-background admin-menu-background">
      <AdminPageHeader onLogout={signOut} subtitle="ULAM POST" />
      <main>
        <PageContainer className="admin-menu-shell">
          <header className="admin-menu-heading">
            <div>
              <p className="eyebrow">Today’s customer menu</p>
              <h1>ULAM POST</h1>
              <p>
                Select reusable food, add today’s menu image, and publish one
                menu customers can order from.
              </p>
            </div>
            <Button
              loading={activeMenu.isFetching || catalog.isFetching}
              onClick={() => void refreshMenuState()}
              variant="secondary"
            >
              Refresh
            </Button>
          </header>

          {notice && (
            <p className="action-notice" role="status">
              <Icon name="check" /> {notice}
            </p>
          )}

          {activeMenu.isPending ? (
            <MenuPageSkeleton />
          ) : activeMenu.isError ? (
            <ErrorState
              description={messageOf(activeMenu.error)}
              onRetry={() => void activeMenu.refetch()}
            />
          ) : activeMenu.data ? (
            <ActiveMenuPanel
              busy={busy}
              menu={activeMenu.data}
              mutationError={
                availabilityMutation.error ?? deactivateMutation.error
              }
              onAvailability={(item) =>
                availabilityMutation.mutate({
                  itemId: item.id,
                  soldOut: !item.isSoldOut,
                })
              }
              onDeactivate={() => setDeactivateOpen(true)}
              onPreview={() => setPreviewOpen(true)}
            />
          ) : (
            <PublishMenuPanel
              busy={busy}
              catalog={catalog.data ?? []}
              catalogError={catalog.error}
              catalogPending={catalog.isPending}
              groupedCatalog={groupedCatalog}
              imageError={imageError}
              menuImage={menuImage}
              mutationError={publishMutation.error}
              onCatalogRetry={() => void catalog.refetch()}
              onImage={(file) => {
                setMenuImage(file)
                setImageError(validateMenuImage(file) ?? undefined)
              }}
              onNavigateCatalog={() => navigate('/admin/catalog')}
              onPublish={() => publishMutation.mutate()}
              onToggle={(id) => {
                setSelectedIds((current) => toggleMenuSelection(current, id))
                setSelectionError(undefined)
              }}
              previewUrl={previewUrl}
              selectedIds={selectedIds}
              selectionError={selectionError}
            />
          )}
        </PageContainer>
      </main>

      <Dialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Customer preview"
        description="A customer-safe view of today’s prices and availability."
      >
        {activeMenu.data && <CustomerPreview menu={activeMenu.data} />}
      </Dialog>

      <Dialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Deactivate today’s menu?"
        description="Customers will no longer be able to order from it. Menu and order history will remain."
      >
        {deactivateMutation.isError && (
          <p className="form-error" role="alert">
            {messageOf(deactivateMutation.error)}
          </p>
        )}
        <div className="catalog-confirm-actions">
          <Button onClick={() => setDeactivateOpen(false)} variant="ghost">
            Go back
          </Button>
          <Button
            loading={deactivateMutation.isPending}
            onClick={() =>
              activeMenu.data && deactivateMutation.mutate(activeMenu.data.id)
            }
            variant="destructive"
          >
            Deactivate menu
          </Button>
        </div>
      </Dialog>
    </AppBackground>
  )
}

function MenuPageSkeleton() {
  return (
    <div className="admin-menu-loading" aria-label="Loading active menu">
      <Skeleton className="admin-menu-hero-skeleton" />
      <Skeleton className="admin-menu-card-skeleton" />
      <Skeleton className="admin-menu-card-skeleton" />
    </div>
  )
}

function ActiveMenuPanel({
  menu,
  busy,
  mutationError,
  onAvailability,
  onDeactivate,
  onPreview,
}: {
  menu: AdminActiveMenu
  busy: boolean
  mutationError: unknown
  onAvailability: (item: AdminMenuItem) => void
  onDeactivate: () => void
  onPreview: () => void
}) {
  return (
    <section className="active-menu-panel" aria-labelledby="active-menu-title">
      <div className="active-menu-summary">
        <AdminMenuImage
          src={publicAssetUrl(menu.imagePath)}
          alt="Today’s published menu"
        />
        <div className="active-menu-summary__copy">
          <Badge variant="available">Active menu</Badge>
          <h2 id="active-menu-title">Today’s menu is live</h2>
          <dl className="active-menu-times">
            <div>
              <dt>Published at</dt>
              <dd>{formatManilaDateTime(menu.activatedAt)}</dd>
            </div>
            <div>
              <dt>Expires at</dt>
              <dd>{formatManilaDateTime(menu.expiresAt)}</dd>
            </div>
            <div>
              <dt>Food items</dt>
              <dd>{menu.items.length}</dd>
            </div>
          </dl>
          <div className="active-menu-actions">
            <Button onClick={onPreview} variant="secondary">
              Customer preview
            </Button>
            <Button
              disabled={busy}
              onClick={onDeactivate}
              variant="destructive"
            >
              Deactivate menu
            </Button>
          </div>
        </div>
      </div>

      {Boolean(mutationError) && (
        <p className="form-error" role="alert">
          {messageOf(mutationError)}
        </p>
      )}

      <div className="published-menu-grid">
        {menu.items.map((item) => (
          <article className="published-menu-card" key={item.id}>
            <div className="published-menu-card__image">
              <AdminMenuImage
                src={publicAssetUrl(item.photoPath)}
                alt={item.name}
              />
              <Badge variant={item.isSoldOut ? 'sold-out' : 'available'}>
                {item.isSoldOut ? 'SOLD OUT' : 'Available'}
              </Badge>
            </div>
            <div className="published-menu-card__body">
              <p className="eyebrow">{item.category}</p>
              <h3>{item.name}</h3>
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
              <p className="internal-note">Admin-only delivery allocation.</p>
              <Button
                disabled={busy}
                onClick={() => onAvailability(item)}
                variant={item.isSoldOut ? 'secondary' : 'destructive'}
              >
                {item.isSoldOut ? 'Mark available' : 'Mark sold out'}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function PublishMenuPanel({
  busy,
  catalog,
  catalogError,
  catalogPending,
  groupedCatalog,
  imageError,
  menuImage,
  mutationError,
  onCatalogRetry,
  onImage,
  onNavigateCatalog,
  onPublish,
  onToggle,
  previewUrl,
  selectedIds,
  selectionError,
}: {
  busy: boolean
  catalog: MenuCatalogItem[]
  catalogError: unknown
  catalogPending: boolean
  groupedCatalog: ReturnType<typeof catalogByCategory>
  imageError?: string
  menuImage: File | null
  mutationError: unknown
  onCatalogRetry: () => void
  onImage: (file: File | null) => void
  onNavigateCatalog: () => void
  onPublish: () => void
  onToggle: (id: string) => void
  previewUrl?: string
  selectedIds: string[]
  selectionError?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <section className="publish-menu-panel" aria-labelledby="create-menu-title">
      <div className="no-active-menu">
        <Badge>No active menu</Badge>
        <h2 id="create-menu-title">Create today’s menu</h2>
        <p>
          Choose active catalog items. Their current names, prices, photos, and
          Internal DF will be snapshotted when published.
        </p>
      </div>

      <div className="menu-image-picker">
        <div>
          <p className="eyebrow">1 · Menu image</p>
          <h3>Add today’s required menu image</h3>
          <p>JPEG, PNG, or WebP · maximum 5 MiB.</p>
        </div>
        <button
          className="menu-image-dropzone"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Selected menu preview" />
          ) : (
            <span>
              <Icon name="image" /> Choose menu image
            </span>
          )}
        </button>
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-describedby={imageError ? 'menu-image-error' : undefined}
          className="visually-hidden"
          id="menu-image"
          onChange={(event) => onImage(event.target.files?.[0] ?? null)}
          ref={inputRef}
          type="file"
        />
        <div className="menu-image-actions">
          <Button onClick={() => inputRef.current?.click()} variant="secondary">
            {menuImage ? 'Replace image' : 'Choose image'}
          </Button>
          {menuImage && (
            <Button onClick={() => onImage(null)} variant="ghost">
              Remove
            </Button>
          )}
        </div>
        {imageError && (
          <p className="field__error" id="menu-image-error" role="alert">
            {imageError}
          </p>
        )}
      </div>

      <div className="menu-selection-section">
        <div className="menu-selection-heading">
          <div>
            <p className="eyebrow">2 · Select food</p>
            <h3>{selectedIds.length} selected</h3>
          </div>
          <p>Archived foods are excluded automatically.</p>
        </div>
        {catalogPending ? (
          <div className="menu-selection-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="menu-selection-skeleton" key={index} />
            ))}
          </div>
        ) : catalogError ? (
          <ErrorState
            description={messageOf(catalogError)}
            onRetry={onCatalogRetry}
          />
        ) : !catalog.length ? (
          <EmptyState
            action={
              <Button onClick={onNavigateCatalog}>Open ULAM PHOTOS</Button>
            }
            description="Add or restore reusable food before publishing a menu."
            icon="image"
            title="No active catalog food"
          />
        ) : (
          groupedCatalog.map((group) => (
            <section className="menu-category-group" key={group.category}>
              <h4>{group.category}</h4>
              <div className="menu-selection-grid">
                {group.items.map((item) => {
                  const selected = selectedIds.includes(item.id)
                  return (
                    <button
                      aria-pressed={selected}
                      className="menu-selection-card"
                      key={item.id}
                      onClick={() => onToggle(item.id)}
                      type="button"
                    >
                      <AdminMenuImage
                        src={publicAssetUrl(item.photoPath)}
                        alt={item.name}
                      />
                      <span className="menu-selection-card__copy">
                        <strong>{item.name}</strong>
                        <span>Price {formatPeso(item.priceCentavos)}</span>
                        <span>
                          Internal DF {formatPeso(item.internalDfCentavos)}
                        </span>
                      </span>
                      <span className="menu-selection-card__state">
                        <Icon name={selected ? 'check' : 'plus'} />
                        {selected ? 'Selected' : 'Select'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))
        )}
        {selectionError && (
          <p className="field__error" role="alert">
            {selectionError}
          </p>
        )}
      </div>

      <div className="menu-publish-review">
        <div>
          <p className="eyebrow">3 · Publish</p>
          <h3>Review and publish</h3>
          <p>
            The menu becomes available immediately and expires automatically
            after 24 hours.
          </p>
        </div>
        <Button
          disabled={busy || !catalog.length}
          loading={busy}
          onClick={onPublish}
          size="large"
        >
          Publish menu
        </Button>
      </div>
      {Boolean(mutationError) && (
        <p className="form-error" role="alert">
          {messageOf(mutationError)}
        </p>
      )}
    </section>
  )
}

function CustomerPreview({ menu }: { menu: AdminActiveMenu }) {
  const items = customerPreviewItems(menu)
  return (
    <div className="customer-menu-preview">
      <AdminMenuImage
        className="customer-menu-preview__hero"
        src={publicAssetUrl(menu.imagePath)}
        alt="Today’s menu"
      />
      <h3>Today’s menu</h3>
      <p>Available until {formatManilaDateTime(menu.expiresAt)}</p>
      <div className="customer-menu-preview__grid">
        {items.map((item) => (
          <article key={item.id}>
            <AdminMenuImage
              src={publicAssetUrl(item.photoPath)}
              alt={item.name}
            />
            <div>
              <span>{item.category}</span>
              <h4>{item.name}</h4>
              <strong>{formatPeso(item.priceCentavos)}</strong>
              <p>{item.isSoldOut ? 'SOLD OUT' : 'Available'}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
