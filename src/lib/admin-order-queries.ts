export const adminOrderQueryKeys = {
  list: (date: string) => ['admin-orders', date] as const,
  totals: (date: string) => ['admin-daily-totals', date] as const,
  detail: (id: string) => ['admin-order', id] as const,
}

export function currentManilaBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}
