import { useEffect, useState } from 'react'
import { AppHeader } from '../../../components/layout/AppHeader'
import {
  AppBackground,
  MobileStickyAction,
  PageContainer,
} from '../../../components/layout/Page'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../../components/ui/Feedback'
import { Icon } from '../../../components/ui/Icon'
import { GlassSurface, SectionHeading } from '../../../components/ui/Surface'
import { formatPeso } from '../../../lib/format-money'
import { cartItemCount, cartSubtotal } from '../cart'
import { useCustomerCart } from '../cart-context'
import { availableCategories, itemsForCategory } from '../menu'
import type { MenuLoadState } from '../types'
import { CartSheet } from './CartSheet'
import { FoodCard } from './FoodCard'
import { FoodImage } from './FoodImage'
import { MenuCategoryTabs } from './MenuCategoryTabs'

export function CustomerMenuExperience({ state }: { state: MenuLoadState }) {
  const { cart, notice, reconcile, setOpen } = useCustomerCart()
  const [requestedCategory, setRequestedCategory] = useState<
    'ULAM' | 'DESSERTS' | 'EXTRAS'
  >('ULAM')
  const menu = state.status === 'success' ? state.menu : undefined

  useEffect(() => {
    if (state.status === 'success') reconcile(state.menu)
  }, [menu, reconcile, state.status])

  const categories = menu ? availableCategories(menu.items) : []
  const selectedCategory = categories.includes(requestedCategory)
    ? requestedCategory
    : categories[0]
  const count = cartItemCount(cart)

  return (
    <AppBackground
      className={
        count
          ? 'customer-ordering customer-ordering--with-cart'
          : 'customer-ordering'
      }
    >
      <AppHeader
        subtitle="Fresh meals, made nearby"
        actions={
          <Button
            aria-label={`Open cart${count ? `, ${count} items` : ''}`}
            onClick={() => setOpen(true)}
            size="icon"
            variant="glass"
          >
            <Icon name="cart" />
            {count > 0 && (
              <span className="cart-count">{count > 99 ? '99+' : count}</span>
            )}
          </Button>
        }
      />
      <main>
        <PageContainer className="customer-shell customer-menu-shell">
          <section className="menu-intro" aria-labelledby="customer-menu-title">
            <div>
              <Badge variant="free">Lutong-bahay, made today</Badge>
              <h1 id="customer-menu-title">Today’s menu</h1>
              <p>Choose your favorites. No account needed.</p>
            </div>
            {menu && (
              <div className="menu-intro__expiry">
                <Icon name="clock" /> Available until{' '}
                {formatTime(menu.expiresAt)}
              </div>
            )}
          </section>

          <section id="todays-menu" aria-live="polite">
            {state.status === 'loading' && <MenuLoading />}
            {state.status === 'error' && (
              <GlassSurface variant="subtle">
                <ErrorState
                  title="We couldn’t load today’s menu"
                  description="Please check your connection and try again."
                  onRetry={state.retry}
                />
              </GlassSurface>
            )}
            {state.status === 'success' && !state.menu && (
              <GlassSurface variant="subtle">
                <EmptyState
                  icon="shopping-bag"
                  title="No menu is available right now"
                  description="Please check back soon for today’s freshly prepared dishes."
                  action={
                    <Button onClick={state.refresh} variant="secondary">
                      Refresh menu
                    </Button>
                  }
                />
              </GlassSurface>
            )}
            {menu && !menu.items.length && (
              <GlassSurface variant="subtle">
                <EmptyState
                  icon="shopping-bag"
                  title="Today’s menu is being prepared"
                  description="The store has not added any dishes yet."
                  action={
                    <Button
                      onClick={
                        state.status === 'success' ? state.refresh : undefined
                      }
                      variant="secondary"
                    >
                      Refresh menu
                    </Button>
                  }
                />
              </GlassSurface>
            )}
            {menu && menu.items.length > 0 && selectedCategory && (
              <>
                <div className="menu-banner">
                  <FoodImage
                    alt="Today’s published menu"
                    src={menu.imagePath}
                  />
                  <div>
                    <p className="eyebrow">Fresh from the kitchen</p>
                    <strong>Made today for your neighborhood</strong>
                  </div>
                </div>
                <div className="category-tabs-wrap">
                  <MenuCategoryTabs
                    categories={categories}
                    onSelect={setRequestedCategory}
                    selected={selectedCategory}
                  />
                </div>
                <section
                  className="menu-category"
                  aria-labelledby={`category-${selectedCategory}`}
                  role="tabpanel"
                >
                  <SectionHeading
                    eyebrow="Browse today’s food"
                    title={categoryTitle(selectedCategory)}
                    description={`${itemsForCategory(menu.items, selectedCategory).length} ${itemsForCategory(menu.items, selectedCategory).length === 1 ? 'choice' : 'choices'} available to browse`}
                  />
                  <div className="food-grid">
                    {itemsForCategory(menu.items, selectedCategory).map(
                      (item) => (
                        <FoodCard item={item} key={item.id} menu={menu} />
                      ),
                    )}
                  </div>
                </section>
              </>
            )}
          </section>

          <p className="customer-ordering__note">
            <Icon name="info" /> Food prices and availability are confirmed
            again before your order is created.
          </p>
        </PageContainer>
      </main>
      <footer className="site-footer">
        <PageContainer>
          <p>Made for easy neighborhood ordering.</p>
          <a href="/admin/login">Owner login</a>
        </PageContainer>
      </footer>
      <span className="sr-only" aria-live="polite">
        {notice}
      </span>
      {count > 0 && (
        <MobileStickyAction className="cart-sticky">
          <Button onClick={() => setOpen(true)} size="large">
            <Icon name="cart" />
            <span>
              View cart · {count} {count === 1 ? 'item' : 'items'}
            </span>
            <strong>{formatPeso(cartSubtotal(cart))}</strong>
          </Button>
        </MobileStickyAction>
      )}
      <CartSheet />
    </AppBackground>
  )
}

function MenuLoading() {
  return (
    <div
      className="menu-loading"
      aria-label="Loading today’s menu"
      role="status"
    >
      <Skeleton className="menu-loading__banner" />
      <div className="menu-loading__tabs">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
      <div className="food-grid">
        {[0, 1, 2, 3].map((item) => (
          <div className="food-card food-card--loading" key={item}>
            <Skeleton className="food-card__skeleton-image" />
            <div className="food-card__body">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function categoryTitle(category: 'ULAM' | 'DESSERTS' | 'EXTRAS') {
  return { ULAM: 'Ulam', DESSERTS: 'Desserts', EXTRAS: 'Extras' }[category]
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'later today'
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
