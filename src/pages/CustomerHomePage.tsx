import { CustomerMenuExperience } from '../features/customer-ordering/components/CustomerMenuExperience'
import { useActiveMenu } from '../features/customer-ordering/hooks/use-active-menu'
import type { MenuLoadState } from '../features/customer-ordering/types'

export function CustomerHomePage() {
  const query = useActiveMenu()
  let state: MenuLoadState

  if (query.isPending) {
    state = { status: 'loading' }
  } else if (query.isError) {
    state = { status: 'error', retry: () => void query.refetch() }
  } else {
    state = {
      status: 'success',
      menu: query.data,
      refresh: () => void query.refetch(),
    }
  }

  return <CustomerMenuExperience state={state} />
}
