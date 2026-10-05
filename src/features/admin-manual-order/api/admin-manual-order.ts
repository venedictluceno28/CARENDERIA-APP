import { AppError } from '../../../lib/api/errors.ts'
import { isMenuCategory } from '../../../lib/menu-category.ts'
import { getSupabaseClient } from '../../../lib/supabase/client.ts'
import type {
  ManualOrderCatalogItem,
  ManualOrderInput,
  ManualOrderResult,
  ManualOrderSettings,
} from '../types.ts'

type CatalogRow = {
  id: string
  name: string
  category: string
  price_centavos: number
  internal_df_centavos: number
}

type SettingsRow = {
  delivery_threshold_centavos: number
  base_charge_centavos: number
  far_area_charge_centavos: number
}

function safeInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function safeManualOrderError(message: string, fallback: string) {
  const known: Record<string, string> = {
    ADMIN_REQUIRED: 'Active administrator access is required.',
    INVALID_ITEMS: 'Review the order items and try again.',
    INVALID_CUSTOMER_DETAILS: 'Review the customer name and address.',
    INVALID_LOCATION: 'Choose a valid delivery area.',
    INVALID_PAYMENT_METHOD: 'Choose Cash or Online Payment.',
  }
  const code = Object.keys(known).find((candidate) =>
    message.includes(candidate),
  )
  return new AppError(
    code === 'ADMIN_REQUIRED' ? 'ADMIN_REQUIRED' : 'UNKNOWN_ERROR',
    code ? known[code] : fallback,
  )
}

export async function listManualOrderCatalog(): Promise<
  ManualOrderCatalogItem[]
> {
  const { data, error } = await getSupabaseClient()
    .from('catalog_items')
    .select('id,name,category,price_centavos,internal_df_centavos')
    .eq('is_archived', false)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (error)
    throw safeManualOrderError(
      error.message,
      'The reusable food catalog could not be loaded.',
    )
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
      },
    ]
  })
}

export async function getManualOrderSettings(): Promise<ManualOrderSettings> {
  const { data, error } = await getSupabaseClient()
    .from('store_settings')
    .select(
      'delivery_threshold_centavos,base_charge_centavos,far_area_charge_centavos',
    )
    .eq('id', 1)
    .single()
  if (error)
    throw safeManualOrderError(
      error.message,
      'Delivery settings could not be loaded.',
    )
  const row = data as SettingsRow
  const deliveryThresholdCentavos = safeInteger(row.delivery_threshold_centavos)
  const baseChargeCentavos = safeInteger(row.base_charge_centavos)
  const farAreaChargeCentavos = safeInteger(row.far_area_charge_centavos)
  if (
    deliveryThresholdCentavos === null ||
    baseChargeCentavos === null ||
    farAreaChargeCentavos === null
  )
    throw new AppError('UNKNOWN_ERROR', 'Delivery settings are invalid.')
  return {
    deliveryThresholdCentavos,
    baseChargeCentavos,
    farAreaChargeCentavos,
  }
}

export async function createManualOrder(
  input: ManualOrderInput,
): Promise<ManualOrderResult> {
  const { data, error } = await getSupabaseClient().rpc(
    'admin_create_manual_order',
    {
      p_items: input.items.map((item) => ({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit_price_centavos: item.unitPriceCentavos,
        internal_df_per_unit_centavos: item.internalDfPerUnitCentavos,
      })),
      p_customer_name: input.customerName,
      p_exact_address: input.exactAddress,
      p_location_classification: input.locationClassification,
      p_selected_area_name: input.selectedAreaName,
      p_payment_method: input.paymentMethod,
    },
  )
  if (error)
    throw safeManualOrderError(error.message, 'The order could not be created.')
  const value = data as Record<string, unknown>
  const grandTotal = safeInteger(value.grand_total_centavos)
  const riderTotal = safeInteger(value.calculated_rider_centavos)
  if (
    typeof value.order_id !== 'string' ||
    typeof value.order_code !== 'string' ||
    typeof value.created_at !== 'string' ||
    grandTotal === null ||
    riderTotal === null
  )
    throw new AppError(
      'UNKNOWN_ERROR',
      'The created order response is invalid.',
    )
  return {
    orderId: value.order_id,
    orderCode: value.order_code,
    createdAt: value.created_at,
    grandTotalCentavos: grandTotal,
    calculatedRiderCentavos: riderTotal,
  }
}
