import { Outlet } from 'react-router-dom'
import { CustomerOrderingProvider } from '../CustomerOrderingProvider'

export function CustomerOrderingLayout() {
  return (
    <CustomerOrderingProvider>
      <Outlet />
    </CustomerOrderingProvider>
  )
}
