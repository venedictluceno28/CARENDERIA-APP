import { getSupabaseClient, getSupabasePublicConfig } from '../supabase/client'
import { AppError } from './errors'

export type OrderSource = 'ONLINE' | 'MANUAL'
export type AdminPaymentMethod = 'CASH' | 'ONLINE_PAYMENT'
export type AdminPaymentState = 'NOT_VERIFIED' | 'VERIFIED' | null
export type AdminOrderCategory = 'ULAM' | 'DESSERTS' | 'EXTRAS'

export type DailyTotals = {
  business_date: string
  active_order_count: number
  cancelled_order_count: number
  sales_centavos: number
  customer_delivery_charge_centavos: number
  calculated_rider_centavos: number
  manual_adjustment_centavos: number
  final_rider_centavos: number
}

export type RiderReconciliationResult = Pick<
  DailyTotals,
  | 'business_date'
  | 'calculated_rider_centavos'
  | 'manual_adjustment_centavos'
  | 'final_rider_centavos'
>

export type AdminOrderSummary = {
  id: string
  order_code: string
  source: OrderSource
  customer_name: string
  payment_method: AdminPaymentMethod
  payment_verification_state: AdminPaymentState
  verified_at: string | null
  grand_total_centavos: number
  customer_delivery_charge_centavos: number
  calculated_rider_centavos: number
  is_cancelled: boolean
  cancellation_reason: string | null
  created_at: string
  last_edited_at: string
}

export type AdminOrderItem = {
  id: string
  published_menu_item_id: string | null
  catalog_item_id: string | null
  name_snapshot: string
  category_snapshot: AdminOrderCategory
  quantity: number
  unit_price_centavos: number
  internal_df_per_unit_centavos: number
  item_subtotal_centavos: number
  internal_df_total_centavos: number
  sort_order: number
}

export type AdminEvidence = {
  id: string
  purpose: 'PAYMENT_EVIDENCE'
  mime_type: string
  size_bytes: number
  created_at: string
}

export type AdminOrderDetail = AdminOrderSummary & {
  exact_address: string
  location_classification: 'NEARBY' | 'OUTSIDE'
  selected_area_name: string | null
  food_subtotal_centavos: number
  internal_df_total_centavos: number
  base_delivery_charge_centavos: number
  far_area_charge_centavos: number
  cancelled_at: string | null
  restored_at: string | null
  delivery_threshold_centavos: number
  base_charge_below_threshold_centavos: number
  far_area_rate_centavos: number
  order_items: AdminOrderItem[]
  evidence: AdminEvidence[]
}

export type AdminEditOrderInput = {
  orderId: string
  customerName: string
  exactAddress: string
  locationClassification: 'NEARBY' | 'OUTSIDE'
  selectedAreaName: string | null
  paymentMethod: AdminPaymentMethod
  deliveryThresholdCentavos: number
  baseChargeBelowThresholdCentavos: number
  farAreaRateCentavos: number
  items: Array<{
    publishedMenuItemId: string | null
    catalogItemId: string | null
    name: string
    category: AdminOrderCategory
    quantity: number
    unitPriceCentavos: number
    internalDfPerUnitCentavos: number
  }>
}

const summaryColumns =
  'id,order_code,source,customer_name,payment_method,payment_verification_state,verified_at,grand_total_centavos,customer_delivery_charge_centavos,calculated_rider_centavos,is_cancelled,cancellation_reason,created_at,last_edited_at'

export async function getAdminDailyTotals(
  businessDate: string,
): Promise<DailyTotals> {
  const { data, error } = await getSupabaseClient().rpc(
    'admin_get_daily_totals',
    { p_business_date: businessDate },
  )
  if (error)
    throw safeAdminError(error.message, 'Admin totals could not be loaded.')
  return data as DailyTotals
}

export async function listAdminOrders(
  businessDate: string,
): Promise<AdminOrderSummary[]> {
  const { data, error } = await getSupabaseClient()
    .from('orders')
    .select(summaryColumns)
    .eq('business_date', businessDate)
    .order('created_at', { ascending: false })
  if (error)
    throw safeAdminError(error.message, 'Today’s orders could not be loaded.')
  return (data ?? []) as AdminOrderSummary[]
}

export async function getAdminOrderDetail(
  orderId: string,
): Promise<AdminOrderDetail> {
  const client = getSupabaseClient()
  const [orderResult, evidenceResult] = await Promise.all([
    client
      .from('orders')
      .select(
        `${summaryColumns},exact_address,location_classification,selected_area_name,food_subtotal_centavos,internal_df_total_centavos,base_delivery_charge_centavos,far_area_charge_centavos,cancelled_at,restored_at,delivery_threshold_centavos,base_charge_below_threshold_centavos,far_area_rate_centavos,order_items(id,published_menu_item_id,catalog_item_id,name_snapshot,category_snapshot,quantity,unit_price_centavos,internal_df_per_unit_centavos,item_subtotal_centavos,internal_df_total_centavos,sort_order)`,
      )
      .eq('id', orderId)
      .order('sort_order', { referencedTable: 'order_items', ascending: true })
      .single(),
    client
      .from('message_attachments')
      .select('id,purpose,mime_type,size_bytes,created_at')
      .eq('order_id', orderId)
      .eq('purpose', 'PAYMENT_EVIDENCE')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])
  if (orderResult.error)
    throw safeAdminError(
      orderResult.error.message,
      'Order details could not be loaded.',
    )
  if (evidenceResult.error)
    throw safeAdminError(
      evidenceResult.error.message,
      'Payment evidence could not be loaded.',
    )
  return {
    ...(orderResult.data as Omit<AdminOrderDetail, 'evidence'>),
    evidence: (evidenceResult.data ?? []) as AdminEvidence[],
  }
}

export async function editAdminOrder(input: AdminEditOrderInput) {
  const { data, error } = await getSupabaseClient().rpc('admin_edit_order', {
    p_order_id: input.orderId,
    p_items: input.items.map((item) => ({
      published_menu_item_id: item.publishedMenuItemId,
      catalog_item_id: item.catalogItemId,
      name: item.name.trim(),
      category: item.category,
      quantity: item.quantity,
      unit_price_centavos: item.unitPriceCentavos,
      internal_df_per_unit_centavos: item.internalDfPerUnitCentavos,
    })),
    p_customer_name: input.customerName.trim(),
    p_exact_address: input.exactAddress.trim(),
    p_location_classification: input.locationClassification,
    p_selected_area_name:
      input.locationClassification === 'NEARBY' ? input.selectedAreaName : null,

    p_payment_method: input.paymentMethod,
    p_delivery_threshold_centavos: input.deliveryThresholdCentavos,
    p_base_charge_below_threshold_centavos:
      input.baseChargeBelowThresholdCentavos,
    p_far_area_rate_centavos: input.farAreaRateCentavos,
  })
  if (error)
    throw safeAdminError(error.message, 'The order could not be saved.')
  return data as {
    order_id: string
    food_subtotal_centavos: number
    internal_df_total_centavos: number
    customer_delivery_charge_centavos: number
    grand_total_centavos: number
    calculated_rider_centavos: number
  }
}

export async function cancelAdminOrder(orderId: string, reason?: string) {
  const { error } = await getSupabaseClient().rpc('admin_cancel_order', {
    p_order_id: orderId,
    p_reason: reason?.trim() || null,
  })
  if (error)
    throw safeAdminError(error.message, 'The order could not be cancelled.')
}

export async function restoreAdminOrder(orderId: string) {
  const { error } = await getSupabaseClient().rpc('admin_restore_order', {
    p_order_id: orderId,
  })
  if (error)
    throw safeAdminError(error.message, 'The order could not be restored.')
}

export async function setAdminPaymentVerification(
  orderId: string,
  verified: boolean,
) {
  const { error } = await getSupabaseClient().rpc(
    'admin_set_payment_verification',
    { p_order_id: orderId, p_verified: verified },
  )
  if (error)
    throw safeAdminError(
      error.message,
      'Payment verification could not be updated.',
    )
}

export async function reconcileAdminRiderDay(
  businessDate: string,
  manualAdjustmentCentavos: number,
): Promise<RiderReconciliationResult> {
  const { data, error } = await getSupabaseClient().rpc(
    'admin_reconcile_rider_day',
    {
      p_business_date: businessDate,
      p_manual_adjustment_centavos: manualAdjustmentCentavos,
    },
  )
  if (error)
    throw safeAdminError(
      error.message,
      'The rider adjustment could not be saved.',
    )
  return data as RiderReconciliationResult
}

export async function getAdminEvidenceSignedUrl(
  attachmentId: string,
): Promise<string> {
  const { data, error } = await getSupabaseClient().functions.invoke(
    'admin-messaging',
    { body: { action: 'signed_read', attachmentId } },
  )
  if (error || !data?.signedUrl)
    throw new AppError(
      'UNKNOWN_ERROR',
      'The private payment image could not be opened.',
    )
  return new URL(data.signedUrl, getSupabasePublicConfig().url).toString()
}

function safeAdminError(rawMessage: string, fallback: string): AppError {
  return new AppError(
    rawMessage.includes('ADMIN_REQUIRED') ? 'ADMIN_REQUIRED' : 'UNKNOWN_ERROR',
    rawMessage.includes('ADMIN_REQUIRED')
      ? 'Active administrator access is required.'
      : fallback,
  )
}
