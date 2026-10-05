import { getSupabaseClient } from '../../../lib/supabase/client'
import { publicAssetUrl } from '../../../lib/public-asset-url'
import { isMenuCategory } from '../../../lib/menu-category.ts'
import type { PublishedMenu } from '../types'

type MenuRow = {
  id: string
  image_path: string
  activated_at: string
  expires_at: string
}

type ItemRow = {
  id: string
  published_menu_id: string
  name_snapshot: string
  category_snapshot: string
  unit_price_centavos: number
  photo_path_snapshot: string
  is_sold_out: boolean
  sort_order: number
}

export async function loadActiveMenu(): Promise<PublishedMenu | null> {
  const client = getSupabaseClient()
  const requestedAt = new Date().toISOString()
  const { data: menus, error: menuError } = await client
    .from('published_menus')
    .select('id,image_path,activated_at,expires_at')
    .eq('is_current', true)
    .lte('activated_at', requestedAt)
    .gt('expires_at', requestedAt)
    .is('deactivated_at', null)
    .order('activated_at', { ascending: false })
    .limit(1)
  if (menuError) throw menuError
  const menu = menus?.[0] as MenuRow | undefined
  if (!menu) return null

  const { data: itemRows, error: itemError } = await client
    .from('published_menu_items')
    .select(
      'id,published_menu_id,name_snapshot,category_snapshot,unit_price_centavos,photo_path_snapshot,is_sold_out,sort_order',
    )
    .eq('published_menu_id', menu.id)
    .order('sort_order', { ascending: true })
    .order('name_snapshot', { ascending: true })
  if (itemError) throw itemError

  return {
    id: menu.id,
    imagePath: publicAssetUrl(menu.image_path),
    activatedAt: menu.activated_at,
    expiresAt: menu.expires_at,
    items: (itemRows as ItemRow[]).flatMap((item) => {
      if (!isMenuCategory(item.category_snapshot)) return []
      const unitPriceCentavos = Number(item.unit_price_centavos)
      if (!Number.isSafeInteger(unitPriceCentavos) || unitPriceCentavos < 0)
        return []
      return [
        {
          id: item.id,
          publishedMenuId: item.published_menu_id,
          name: item.name_snapshot,
          category: item.category_snapshot,
          unitPriceCentavos,
          imagePath: publicAssetUrl(item.photo_path_snapshot),
          isSoldOut: item.is_sold_out,
          sortOrder: item.sort_order,
        },
      ]
    }),
  }
}
