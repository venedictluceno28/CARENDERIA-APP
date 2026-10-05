export const NEARBY_AREAS = [
  'Marycris Complex',
  'Wellington Place',
  'Elliston Place',
] as const

export type NearbyArea = (typeof NEARBY_AREAS)[number]
export type DeliveryArea = NearbyArea | 'OUTSIDE'
