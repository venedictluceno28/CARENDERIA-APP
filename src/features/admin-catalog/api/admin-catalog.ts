import { AppError } from '../../../lib/api/errors.ts'
import { getSupabaseClient } from '../../../lib/supabase/client.ts'
import type { CatalogItem, CatalogItemInput } from '../types.ts'

type CatalogRow = {
  id: string
  name: string
  category: CatalogItem['category']
  price_centavos: number
  internal_df_centavos: number
  photo_path: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

const columns =
  'id,name,category,price_centavos,internal_df_centavos,photo_path,is_archived,created_at,updated_at'

function mapRow(row: CatalogRow): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    priceCentavos: Number(row.price_centavos),
    internalDfCentavos: Number(row.internal_df_centavos),
    photoPath: row.photo_path,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function safeCatalogError(message: string, fallback: string) {
  return new AppError(
    message.includes('ADMIN_REQUIRED') ? 'ADMIN_REQUIRED' : 'UNKNOWN_ERROR',
    message.includes('ADMIN_REQUIRED')
      ? 'Active administrator access is required.'
      : fallback,
  )
}

export async function listAdminCatalog(): Promise<CatalogItem[]> {
  const { data, error } = await getSupabaseClient()
    .from('catalog_items')
    .select(columns)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (error)
    throw safeCatalogError(
      error.message,
      'The food catalog could not be loaded.',
    )
  return ((data ?? []) as CatalogRow[]).map(mapRow)
}

export async function uploadCatalogPhoto(itemId: string, file: File) {
  const form = new FormData()
  form.set('catalogItemId', itemId)
  form.set('file', file)
  const { data, error } = await getSupabaseClient().functions.invoke(
    'admin-catalog-image',
    { body: form },
  )
  if (error || typeof data?.photoPath !== 'string')
    throw new AppError('UNKNOWN_ERROR', 'The food photo could not be uploaded.')
  return data.photoPath as string
}

export async function createCatalogItem(input: CatalogItemInput) {
  if (!input.photoPath)
    throw new AppError('UNKNOWN_ERROR', 'A food photo is required.')
  const { data, error } = await getSupabaseClient().rpc(
    'admin_create_catalog_item',
    {
      p_catalog_item_id: input.id,
      p_name: input.name,
      p_category: input.category,
      p_price_centavos: input.priceCentavos,
      p_internal_df_centavos: input.internalDfCentavos,
      p_photo_path: input.photoPath,
    },
  )
  if (error)
    throw safeCatalogError(error.message, 'The food item could not be created.')
  return mapRow(data as CatalogRow)
}

export async function updateCatalogItem(input: CatalogItemInput) {
  const { data, error } = await getSupabaseClient().rpc(
    'admin_update_catalog_item',
    {
      p_catalog_item_id: input.id,
      p_name: input.name,
      p_category: input.category,
      p_price_centavos: input.priceCentavos,
      p_internal_df_centavos: input.internalDfCentavos,
      p_photo_path: input.photoPath ?? null,
    },
  )
  if (error)
    throw safeCatalogError(error.message, 'The food item could not be saved.')
  return mapRow(data as CatalogRow)
}

export async function setCatalogItemArchived(id: string, archived: boolean) {
  const { data, error } = await getSupabaseClient().rpc(
    'admin_set_catalog_item_archived',
    { p_catalog_item_id: id, p_archived: archived },
  )
  if (error)
    throw safeCatalogError(
      error.message,
      archived
        ? 'The food item could not be archived.'
        : 'The food item could not be restored.',
    )
  return mapRow(data as CatalogRow)
}
