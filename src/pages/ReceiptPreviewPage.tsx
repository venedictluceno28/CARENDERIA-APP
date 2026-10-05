import { useSearchParams } from 'react-router-dom'
import { AppHeader } from '../components/layout/AppHeader'
import { AppBackground, PageContainer } from '../components/layout/Page'
import { ReceiptView } from '../features/customer-ordering/components/ReceiptPage'
import type { GuestReceipt } from '../lib/api/guest-access'

const baseReceipt: GuestReceipt = {
  order_code: 'CRD-AB12CD34EF',
  customer_name: 'Maria Alexandra Dela Cruz-Santos',
  exact_address:
    'Block 123 Lot 456, Mahabang Pangalan Street, Phase 7, beside the blue covered court',
  location_classification: 'NEARBY',
  selected_area_name: 'Marycris Complex',
  payment_method: 'CASH',
  payment_verification_state: null,
  food_subtotal_centavos: 25000,
  customer_delivery_charge_centavos: 0,
  grand_total_centavos: 25000,
  is_cancelled: false,
  created_at: new Date().toISOString(),
  guest_expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
  items: [
    {
      name: 'Creamy Beef Caldereta with Garden Vegetables',
      category: 'ULAM',
      quantity: 2,
      unit_price_centavos: 10000,
      item_subtotal_centavos: 20000,
    },
    {
      name: 'Buko Pandan',
      category: 'DESSERTS',
      quantity: 1,
      unit_price_centavos: 5000,
      item_subtotal_centavos: 5000,
    },
  ],
}

export function ReceiptPreviewPage() {
  const [params] = useSearchParams()
  const online = params.get('payment') === 'online'
  const paid = params.get('delivery') === 'paid'
  const receipt: GuestReceipt = {
    ...baseReceipt,
    payment_method: online ? 'ONLINE_PAYMENT' : 'CASH',
    payment_verification_state: online ? 'NOT_VERIFIED' : null,
    customer_delivery_charge_centavos: paid ? 3500 : 0,
    grand_total_centavos: paid ? 28500 : 25000,
  }
  return (
    <AppBackground className="receipt-page">
      <AppHeader subtitle="Receipt preview" />
      <main>
        <PageContainer className="receipt-shell">
          <ReceiptView receipt={receipt} />
        </PageContainer>
      </main>
    </AppBackground>
  )
}
