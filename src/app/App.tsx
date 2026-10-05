import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLoginPage } from '../features/admin-auth/components/AdminLoginPage'
import { AdminRouteGuard } from '../features/admin-auth/components/AdminRouteGuard'
import { AdminShellPage } from '../features/admin-auth/components/AdminShellPage'
import { AdminOrdersPage } from '../features/admin-orders/components/AdminOrdersPage'
import { AdminCatalogPage } from '../features/admin-catalog/components/AdminCatalogPage'
import { AdminMenuPage } from '../features/admin-menu/components/AdminMenuPage'
import { AdminManualOrderPage } from '../features/admin-manual-order/components/AdminManualOrderPage'
import { AdminAddressBookPage } from '../features/admin-address-book/components/AdminAddressBookPage'
import {
  AdminConversationPage,
  AdminMessagesPage,
} from '../features/admin-messages'
import { AuthProvider } from '../features/admin-auth/components/AuthProvider'
import { CustomerOrderingLayout } from '../features/customer-ordering/components/CustomerOrderingLayout'
import { CheckoutPage } from '../features/customer-ordering/components/CheckoutPage'
import { MessageBoundaryPage } from '../features/customer-ordering/components/MessageBoundaryPage'
import { ReceiptPage } from '../features/customer-ordering/components/ReceiptPage'
import { CustomerHomePage } from '../pages/CustomerHomePage'
import { CustomerOrderingPreviewPage } from '../pages/CustomerOrderingPreviewPage'
import { DesignSystemPage } from '../pages/DesignSystemPage'
import { ReceiptPreviewPage } from '../pages/ReceiptPreviewPage'

function DevelopmentRenderFailure(): never {
  throw new Error('Intentional development-only render failure')
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<CustomerOrderingLayout />}>
          <Route path="/" element={<CustomerHomePage />} />
          <Route path="/order/address" element={<CheckoutPage />} />
          <Route path="/order/receipt/:orderCode" element={<ReceiptPage />} />
          <Route
            path="/order/receipt/:orderCode/message"
            element={<MessageBoundaryPage />}
          />
          {import.meta.env.DEV && (
            <>
              <Route
                path="/__customer-ordering"
                element={<CustomerOrderingPreviewPage />}
              />
              <Route path="/__receipt" element={<ReceiptPreviewPage />} />
            </>
          )}
        </Route>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <AdminRouteGuard>
              <AdminShellPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path="/admin/orders"
          element={
            <AdminRouteGuard>
              <AdminOrdersPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path="/admin/catalog"
          element={
            <AdminRouteGuard>
              <AdminCatalogPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path="/admin/menu"
          element={
            <AdminRouteGuard>
              <AdminMenuPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path="/admin/manual-order"
          element={
            <AdminRouteGuard>
              <AdminManualOrderPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path="/admin/address-book"
          element={
            <AdminRouteGuard>
              <AdminAddressBookPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path="/admin/messages"
          element={
            <AdminRouteGuard>
              <AdminMessagesPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path="/admin/messages/:orderId"
          element={
            <AdminRouteGuard>
              <AdminConversationPage />
            </AdminRouteGuard>
          }
        />
        {import.meta.env.DEV && (
          <>
            <Route path="/__design-system" element={<DesignSystemPage />} />
            <Route path="/__admin-shell" element={<AdminShellPage />} />
            <Route
              path="/__error-boundary"
              element={<DevelopmentRenderFailure />}
            />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
