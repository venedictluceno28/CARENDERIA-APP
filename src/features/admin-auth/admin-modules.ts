import type { IconName } from '../../components/ui/Icon.tsx'

export type AdminModule = {
  title: string
  description: string
  icon: IconName
  enabled: boolean
  route?: string
}

export const adminModules: AdminModule[] = [
  {
    title: 'ULAM POST',
    description: 'Prepare and publish today’s menu',
    icon: 'chef-hat',
    enabled: true,
    route: '/admin/menu',
  },
  {
    title: 'ULAM PHOTOS',
    description: 'Manage your reusable food catalog',
    icon: 'image',
    enabled: true,
    route: '/admin/catalog',
  },
  {
    title: 'MESSAGE',
    description: 'Read customer order conversations',
    icon: 'message',
    enabled: true,
    route: '/admin/messages',
  },
  {
    title: 'ADDRESS BOOK',
    description: 'Find and manage saved addresses',
    icon: 'book-user',
    enabled: true,
    route: '/admin/address-book',
  },
  {
    title: 'MANUAL ORDER',
    description: 'Record phone and outside orders',
    icon: 'plus',
    enabled: true,
    route: '/admin/manual-order',
  },
  {
    title: 'TODAY’S ORDERS',
    description: 'Review orders, sales, delivery, and rider totals',
    icon: 'orders',
    enabled: true,
    route: '/admin/orders',
  },
  {
    title: 'SETTINGS',
    description: 'Store identity, text size, and preferences',
    icon: 'settings',
    enabled: false,
  },
]
