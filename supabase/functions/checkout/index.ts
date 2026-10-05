import {
  clientNetworkIdentity,
  enforceRateLimit,
  RateLimitFailure,
  rateLimitResponse,
} from '../_shared/rate-limit.ts'

const MAX_BODY_BYTES = 16_384
const MAX_CART_LINES = 50

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CartLine = {
  publishedMenuItemId: string
  quantity: number
  expectedUnitPriceCentavos: number
}

type CheckoutRequest = {
  idempotencyKey: string
  guestToken: string
  publishedMenuId: string
  items: CartLine[]
  customerName: string
  exactAddress: string
  locationClassification: 'NEARBY' | 'OUTSIDE'
  selectedAreaName?: string | null
  paymentMethod: 'CASH' | 'ONLINE_PAYMENT'
}

type RpcError = {
  message?: string
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const guestTokenPattern = /^[A-Za-z0-9_-]{43}$/

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  )
}

function validateRequest(value: unknown): value is CheckoutRequest {
  if (!value || typeof value !== 'object') return false
  const input = value as Record<string, unknown>
  if (
    typeof input.idempotencyKey !== 'string' ||
    !uuidV4Pattern.test(input.idempotencyKey) ||
    typeof input.guestToken !== 'string' ||
    !guestTokenPattern.test(input.guestToken) ||
    typeof input.publishedMenuId !== 'string' ||
    !uuidPattern.test(input.publishedMenuId)
  )
    return false
  if (
    !isNonEmptyString(input.customerName, 160) ||
    !isNonEmptyString(input.exactAddress, 1000)
  )
    return false
  if (
    input.locationClassification !== 'NEARBY' &&
    input.locationClassification !== 'OUTSIDE'
  )
    return false
  if (
    input.locationClassification === 'NEARBY' &&
    !isNonEmptyString(input.selectedAreaName, 160)
  )
    return false
  if (
    input.selectedAreaName != null &&
    typeof input.selectedAreaName !== 'string'
  )
    return false
  if (
    input.paymentMethod !== 'CASH' &&
    input.paymentMethod !== 'ONLINE_PAYMENT'
  )
    return false
  if (
    !Array.isArray(input.items) ||
    input.items.length === 0 ||
    input.items.length > MAX_CART_LINES
  )
    return false

  const seen = new Set<string>()
  for (const rawLine of input.items) {
    if (!rawLine || typeof rawLine !== 'object') return false
    const line = rawLine as Record<string, unknown>
    if (
      typeof line.publishedMenuItemId !== 'string' ||
      !uuidPattern.test(line.publishedMenuItemId)
    )
      return false
    if (seen.has(line.publishedMenuItemId)) return false
    seen.add(line.publishedMenuItemId)
    if (
      !Number.isSafeInteger(line.quantity) ||
      (line.quantity as number) <= 0 ||
      (line.quantity as number) > 2_147_483_647
    )
      return false
    if (
      !Number.isSafeInteger(line.expectedUnitPriceCentavos) ||
      (line.expectedUnitPriceCentavos as number) < 0
    )
      return false
  }
  return true
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function safeRpcError(error: RpcError): { status: number; body: unknown } {
  const rawMessage = typeof error.message === 'string' ? error.message : ''
  const separator = rawMessage.indexOf('|')
  const code = (
    separator >= 0 ? rawMessage.slice(0, separator) : rawMessage
  ).trim()
  const publicCodes = new Set([
    'MENU_INACTIVE',
    'MENU_EXPIRED',
    'ITEM_NOT_FOUND',
    'ITEM_SOLD_OUT',
    'PRICE_CHANGED',
    'INVALID_QUANTITY',
    'INVALID_LOCATION',
    'INVALID_PAYMENT_METHOD',
    'INVALID_ITEMS',
    'INVALID_CUSTOMER_DETAILS',
    'DUPLICATE_ITEM',
    'INVALID_IDEMPOTENCY_KEY',
    'INVALID_GUEST_TOKEN',
    'IDEMPOTENCY_CONFLICT',
  ])

  if (!publicCodes.has(code)) {
    return {
      status: 500,
      body: {
        error: {
          code: 'CHECKOUT_FAILED',
          message: 'Checkout could not be completed.',
        },
      },
    }
  }

  let details: unknown
  if (separator >= 0) {
    try {
      details = JSON.parse(rawMessage.slice(separator + 1))
    } catch {
      details = undefined
    }
  }
  const conflictCodes = new Set([
    'MENU_INACTIVE',
    'MENU_EXPIRED',
    'ITEM_NOT_FOUND',
    'ITEM_SOLD_OUT',
    'PRICE_CHANGED',
    'IDEMPOTENCY_CONFLICT',
  ])
  return {
    status: conflictCodes.has(code) ? 409 : 400,
    body: {
      error: {
        code,
        message: code.replaceAll('_', ' ').toLowerCase(),
        ...(details === undefined ? {} : { details }),
      },
    },
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST')
    return jsonResponse(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' },
    })

  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, {
      error: {
        code: 'REQUEST_TOO_LARGE',
        message: 'Checkout request is too large.',
      },
    })
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonResponse(413, {
      error: {
        code: 'REQUEST_TOO_LARGE',
        message: 'Checkout request is too large.',
      },
    })
  }

  let input: unknown
  try {
    input = JSON.parse(rawBody)
  } catch {
    return jsonResponse(400, {
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body must be valid JSON.',
      },
    })
  }
  if (!validateRequest(input)) {
    return jsonResponse(400, {
      error: {
        code: 'INVALID_REQUEST',
        message: 'Checkout request is invalid.',
      },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: {
        code: 'CHECKOUT_FAILED',
        message: 'Checkout is temporarily unavailable.',
      },
    })
  }

  try {
    await enforceRateLimit(
      supabaseUrl,
      serviceRoleKey,
      'checkout:ip',
      clientNetworkIdentity(request),
      10,
      600,
    )
  } catch (error) {
    if (error instanceof RateLimitFailure)
      return rateLimitResponse(error, corsHeaders)
    throw error
  }

  const [guestTokenHash, idempotencyKeyHash] = await Promise.all([
    sha256(input.guestToken),
    sha256(input.idempotencyKey),
  ])
  const rpcResponse = await fetch(
    `${supabaseUrl}/rest/v1/rpc/create_online_order`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_published_menu_id: input.publishedMenuId,
        p_items: input.items.map((item) => ({
          published_menu_item_id: item.publishedMenuItemId,
          quantity: item.quantity,
          expected_unit_price_centavos: item.expectedUnitPriceCentavos,
        })),
        p_customer_name: input.customerName.trim(),
        p_exact_address: input.exactAddress.trim(),
        p_location_classification: input.locationClassification,
        p_selected_area_name:
          input.locationClassification === 'NEARBY'
            ? input.selectedAreaName?.trim()
            : null,
        p_payment_method: input.paymentMethod,
        p_guest_token_hash: guestTokenHash,
        p_idempotency_key_hash: idempotencyKeyHash,
      }),
    },
  )

  const rpcBody = await rpcResponse.json().catch(() => ({}))
  if (!rpcResponse.ok) {
    const safeError = safeRpcError(rpcBody as RpcError)
    return jsonResponse(safeError.status, safeError.body)
  }

  const replayed =
    typeof rpcBody === 'object' &&
    rpcBody !== null &&
    (rpcBody as Record<string, unknown>).idempotent_replay === true
  return jsonResponse(replayed ? 200 : 201, {
    ...rpcBody,
    guestToken: input.guestToken,
  })
})
