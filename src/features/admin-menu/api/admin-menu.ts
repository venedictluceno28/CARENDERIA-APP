import { AppError } from '../../../lib/api/errors.ts'
import { isMenuCategory } from '../../../lib/menu-category.ts'
import { getSupabaseClient } from '../../../lib/supabase/client.ts'
import type {
  AdminActiveMenu,
  AdminMenuItem,
  MenuCatalogItem,
} from '../types.ts'

type CatalogRow = {
  id: string
  name: string
  category: string
  price_centavos: number
  internal_df_centavos: number
  photo_path: string
}

type MenuPayload = {
  id?: unknown
  image_path?: unknown
  activated_at?: unknown
  expires_at?: unknown
  items?: unknown
}

type MenuItemPayload = {
  id?: unknown
  catalog_item_id?: unknown
  name_snapshot?: unknown
  category_snapshot?: unknown
  unit_price_centavos?: unknown
  internal_df_centavos?: unknown
  photo_path_snapshot?: unknown
  is_sold_out?: unknown
  sort_order?: unknown
}

function safeMenuError(message: string, fallback: string) {
  if (message.includes('MENU_ACTIVE_EXISTS'))
    return new AppError(
      'UNKNOWN_ERROR',
      'A menu is already active. Deactivate it before publishing another.',
    )
  if (message.includes('CATALOG_SELECTION_INVALID'))
    return new AppError(
      'UNKNOWN_ERROR',
      'One or more selected foods are no longer available. Refresh and review your selection.',
    )
  if (message.includes('ADMIN_REQUIRED'))
    return new AppError(
      'ADMIN_REQUIRED',
      'Active administrator access is required.',
    )
  return new AppError('UNKNOWN_ERROR', fallback)
}

function safeInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function mapMenuItem(value: unknown): AdminMenuItem | null {
  const item = value as MenuItemPayload
  const price = safeInteger(item?.unit_price_centavos)
  const internalDf = safeInteger(item?.internal_df_centavos)
  const sortOrder = safeInteger(item?.sort_order)
  if (
    typeof item?.id !== 'string' ||
    typeof item.name_snapshot !== 'string' ||
    typeof item.category_snapshot !== 'string' ||
    !isMenuCategory(item.category_snapshot) ||
    price === null ||
    internalDf === null ||
    typeof item.photo_path_snapshot !== 'string' ||
    typeof item.is_sold_out !== 'boolean' ||
    sortOrder === null
  )
    return null
  return {
    id: item.id,
    catalogItemId:
      typeof item.catalog_item_id === 'string' ? item.catalog_item_id : null,
    name: item.name_snapshot,
    category: item.category_snapshot,
    priceCentavos: price,
    internalDfCentavos: internalDf,
    photoPath: item.photo_path_snapshot,
    isSoldOut: item.is_sold_out,
    sortOrder,
  }
}

function mapActiveMenu(value: unknown): AdminActiveMenu | null {
  if (value === null) return null
  const menu = value as MenuPayload
  if (
    typeof menu?.id !== 'string' ||
    typeof menu.image_path !== 'string' ||
    typeof menu.activated_at !== 'string' ||
    typeof menu.expires_at !== 'string' ||
    !Array.isArray(menu.items)
  )
    throw new AppError('UNKNOWN_ERROR', 'The active menu response is invalid.')
  const items = menu.items.map(mapMenuItem)
  if (items.some((item) => item === null))
    throw new AppError('UNKNOWN_ERROR', 'The active menu response is invalid.')
  return {
    id: menu.id,
    imagePath: menu.image_path,
    activatedAt: menu.activated_at,
    expiresAt: menu.expires_at,
    items: items as AdminMenuItem[],
  }
}

export async function listMenuCatalog(): Promise<MenuCatalogItem[]> {
  const { data, error } = await getSupabaseClient()
    .from('catalog_items')
    .select('id,name,category,price_centavos,internal_df_centavos,photo_path')
    .eq('is_archived', false)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (error)
    throw safeMenuError(error.message, 'The food catalog could not be loaded.')
  return ((data ?? []) as CatalogRow[]).flatMap((row) => {
    const price = safeInteger(row.price_centavos)
    const internalDf = safeInteger(row.internal_df_centavos)
    if (!isMenuCategory(row.category) || price === null || internalDf === null)
      return []
    return [
      {
        id: row.id,
        name: row.name,
        category: row.category,
        priceCentavos: price,
        internalDfCentavos: internalDf,
        photoPath: row.photo_path,
      },
    ]
  })
}

export async function getAdminActiveMenu() {
  const { data, error } = await getSupabaseClient().rpc('admin_get_active_menu')
  if (error)
    throw safeMenuError(error.message, 'The active menu could not be loaded.')
  return mapActiveMenu(data)
}

export async function publishMenu(
  menuId: string,
  catalogItemIds: string[],
  file: File,
) {
  const form = new FormData()
  form.set('menuId', menuId)
  form.set('catalogItemIds', JSON.stringify(catalogItemIds))
  form.set('file', file)
  const { data, error } = await getSupabaseClient().functions.invoke(
    'admin-menu-publish',
    { body: form },
  )
  if (error || data?.menuId !== menuId)
    throw new AppError(
      'UNKNOWN_ERROR',
      'The menu could not be published. Refresh before trying again.',
    )
  return menuId
}

export async function deactivateMenu(menuId: string) {
  const { data, error } = await getSupabaseClient().rpc(
    'admin_deactivate_menu',
    { p_menu_id: menuId },
  )
  if (error)
    throw safeMenuError(error.message, 'The menu could not be deactivated.')
  return data as string
}

export async function setMenuItemSoldOut(itemId: string, soldOut: boolean) {
  const { data, error } = await getSupabaseClient().rpc(
    'admin_set_menu_item_sold_out',
    { p_menu_item_id: itemId, p_sold_out: soldOut },
  )
  if (error)
    throw safeMenuError(
      error.message,
      soldOut
        ? 'The item could not be marked sold out.'
        : 'The item could not be marked available.',
    )
  return data as string
}
