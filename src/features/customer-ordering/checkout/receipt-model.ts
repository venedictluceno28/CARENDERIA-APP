import type { GuestReceipt } from '../../../lib/api/guest-access.ts'

export type ReceiptPaymentStatus = 'Not Verified' | 'Verified' | null

export function receiptPaymentStatus(
  receipt: Pick<GuestReceipt, 'payment_method' | 'payment_verification_state'>,
): ReceiptPaymentStatus {
  if (receipt.payment_method === 'CASH') return null
  return receipt.payment_verification_state === 'VERIFIED'
    ? 'Verified'
    : 'Not Verified'
}

export function receiptDisplayModel(receipt: GuestReceipt) {
  return {
    orderCode: receipt.order_code,
    customerName: receipt.customer_name,
    items: receipt.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceCentavos: item.unit_price_centavos,
      subtotalCentavos: item.item_subtotal_centavos,
    })),
    foodSubtotalCentavos: receipt.food_subtotal_centavos,
    deliveryChargeCentavos: receipt.customer_delivery_charge_centavos,
    grandTotalCentavos: receipt.grand_total_centavos,
    paymentStatus: receiptPaymentStatus(receipt),
  }
}
