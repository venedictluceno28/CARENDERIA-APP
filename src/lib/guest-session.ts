const STORAGE_KEY = 'carenderia.guest-orders.v1'
const ORDER_CODE_PATTERN = /^CRD-[A-HJ-NP-Z2-9]{10}$/
const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type GuestOrderSession = {
  orderCode: string
  guestToken: string
  expiresAt: string
}

export type GuestOrderSessionStatus =
  | { status: 'valid'; session: GuestOrderSession }
  | { status: 'expired' }
  | { status: 'unavailable' }

function readAll(): unknown[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function activeOnly(records: unknown[]): GuestOrderSession[] {
  const now = Date.now()
  return records.filter((value): value is GuestOrderSession => {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    return (
      typeof record.orderCode === 'string' &&
      ORDER_CODE_PATTERN.test(record.orderCode) &&
      typeof record.guestToken === 'string' &&
      GUEST_TOKEN_PATTERN.test(record.guestToken) &&
      typeof record.expiresAt === 'string' &&
      Number.isFinite(Date.parse(record.expiresAt)) &&
      Date.parse(record.expiresAt) > now
    )
  })
}

function writeAll(records: GuestOrderSession[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Checkout still succeeds when storage is unavailable; the UI can display
    // the returned credential and explain that this browser cannot retain it.
  }
}

export function saveGuestOrderSession(record: GuestOrderSession): void {
  const orderCode = record.orderCode.trim().toUpperCase()
  if (
    !ORDER_CODE_PATTERN.test(orderCode) ||
    !GUEST_TOKEN_PATTERN.test(record.guestToken) ||
    !Number.isFinite(Date.parse(record.expiresAt)) ||
    Date.parse(record.expiresAt) <= Date.now()
  )
    return
  const current = activeOnly(readAll()).filter(
    (item) => item.orderCode !== orderCode,
  )
  writeAll([...current, { ...record, orderCode }])
}

export function getGuestOrderSession(
  orderCode: string,
): GuestOrderSession | null {
  const active = activeOnly(readAll())
  writeAll(active)
  return (
    active.find(
      (record) => record.orderCode === orderCode.trim().toUpperCase(),
    ) ?? null
  )
}

export function getGuestOrderSessionStatus(
  orderCode: string,
): GuestOrderSessionStatus {
  const canonicalCode = orderCode.trim().toUpperCase()
  const records = readAll()
  const matching = records.find((value) => {
    if (typeof value !== 'object' || value === null) return false
    return (value as Record<string, unknown>).orderCode === canonicalCode
  })
  const active = activeOnly(records)
  writeAll(active)
  const session = active.find((record) => record.orderCode === canonicalCode)
  if (session) return { status: 'valid', session }
  if (typeof matching !== 'object' || matching === null)
    return { status: 'unavailable' }
  const record = matching as Record<string, unknown>
  const structurallyValid =
    ORDER_CODE_PATTERN.test(canonicalCode) &&
    typeof record.guestToken === 'string' &&
    GUEST_TOKEN_PATTERN.test(record.guestToken) &&
    typeof record.expiresAt === 'string' &&
    Number.isFinite(Date.parse(record.expiresAt))
  return structurallyValid &&
    Date.parse(record.expiresAt as string) <= Date.now()
    ? { status: 'expired' }
    : { status: 'unavailable' }
}

export function clearGuestOrderSession(orderCode: string): void {
  writeAll(
    activeOnly(readAll()).filter(
      (record) => record.orderCode !== orderCode.trim().toUpperCase(),
    ),
  )
}
