const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatPeso(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) return '₱0'
  return pesoFormatter
    .format(centavos / 100)
    .replace('PHP', '₱')
    .replace(/\s/g, '')
}

export function formatDeliveryCharge(centavos: number): string {
  return centavos === 0 ? 'FREE Delivery' : `${formatPeso(centavos)} delivery`
}
