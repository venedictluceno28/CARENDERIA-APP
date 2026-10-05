type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retry_after_seconds: number
}

export class RateLimitFailure extends Error {
  constructor(
    public readonly retryAfterSeconds: number,
    public readonly unavailable = false,
  ) {
    super(unavailable ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMITED')
  }
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

export function clientNetworkIdentity(request: Request): string {
  const value =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    'unknown'
  return value.slice(0, 200)
}

export async function enforceRateLimit(
  url: string,
  serviceKey: string,
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const identityHash = await sha256(`${scope}\u0000${identity}`)
  let response: Response
  try {
    response = await fetch(`${url}/rest/v1/rpc/consume_edge_rate_limit`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_scope: scope,
        p_identity_hash: identityHash,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      }),
    })
  } catch {
    throw new RateLimitFailure(30, true)
  }

  const result = (await response
    .json()
    .catch(() => null)) as RateLimitResult | null
  if (!response.ok || !result) throw new RateLimitFailure(30, true)
  if (!result.allowed) {
    throw new RateLimitFailure(
      Math.max(1, Math.min(result.retry_after_seconds || 30, windowSeconds)),
    )
  }
}

export function rateLimitResponse(
  error: RateLimitFailure,
  corsHeaders: Record<string, string>,
): Response {
  const status = error.unavailable ? 503 : 429
  const code = error.unavailable ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMITED'
  return new Response(
    JSON.stringify({
      error: {
        code,
        message: error.unavailable
          ? 'The request cannot be accepted right now.'
          : 'Too many requests. Please try again later.',
      },
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(error.retryAfterSeconds),
      },
    },
  )
}
