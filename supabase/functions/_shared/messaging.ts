export const JSON_BODY_LIMIT = 32_768
export const MAX_FILE_BYTES = 5_242_880
export const SIGNED_URL_SECONDS = 60
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class RpcFailure extends Error {
  status: number
  payload: Record<string, unknown>

  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.message === 'string' ? payload.message : 'RPC_FAILED')
    this.status = status
    this.payload = payload
  }
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export function getEnvironment() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !serviceKey || !anonKey) throw new Error('MISSING_ENVIRONMENT')
  return { url, serviceKey, anonKey }
}

export async function hashGuestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export async function callRpc<T>(
  url: string,
  apiKey: string,
  bearer: string,
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parameters),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) throw new RpcFailure(response.status, payload)
  return payload as T
}

function storageObjectUrl(url: string, bucket: string, path: string): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`
}

export async function uploadObject(
  url: string,
  serviceKey: string,
  bucket: string,
  path: string,
  file: File,
): Promise<void> {
  const response = await fetch(storageObjectUrl(url, bucket, path), {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': file.type,
      'x-upsert': 'false',
    },
    body: file,
  })
  if (!response.ok) throw new Error('STORAGE_UPLOAD_FAILED')
}

export async function deleteObject(
  url: string,
  serviceKey: string,
  bucket: string,
  path: string,
): Promise<'deleted' | 'missing'> {
  const response = await fetch(storageObjectUrl(url, bucket, path), {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  })
  if (response.ok) return 'deleted'
  if (response.status === 404) return 'missing'
  if (response.status === 400) {
    const payload = (await response.json().catch(() => null)) as {
      statusCode?: string
      code?: string
    } | null
    if (payload?.statusCode === '404' || payload?.code === 'NoSuchKey')
      return 'missing'
  }
  throw new Error('STORAGE_DELETE_FAILED')
}

export async function detectImageMime(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp'
  return null
}

export async function createSignedUrl(
  url: string,
  serviceKey: string,
  bucket: string,
  path: string,
): Promise<string> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(
    `${url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
    },
  )
  const payload = (await response.json().catch(() => ({}))) as {
    signedURL?: string
    signedUrl?: string
  }
  const signedPath = payload.signedURL ?? payload.signedUrl
  if (!response.ok || !signedPath) throw new Error('SIGNED_URL_FAILED')
  const parsed = new URL(signedPath, `${url}/storage/v1/`)
  const publicPath = parsed.pathname.startsWith('/storage/v1/')
    ? parsed.pathname
    : `/storage/v1${parsed.pathname.startsWith('/') ? '' : '/'}${parsed.pathname}`
  return `${publicPath}${parsed.search}`
}

export function extensionForMime(mimeType: string): string | null {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return null
}

export function validateGuestIdentity(
  orderCode: unknown,
  guestToken: unknown,
): orderCode is string {
  return (
    typeof orderCode === 'string' &&
    /^CRD-[A-HJ-NP-Z2-9]{10}$/u.test(orderCode.trim().toUpperCase()) &&
    typeof guestToken === 'string' &&
    /^[A-Za-z0-9_-]{43}$/u.test(guestToken)
  )
}

export function safeError(error: unknown): Response {
  if (error instanceof RpcFailure) {
    const message =
      typeof error.payload.message === 'string' ? error.payload.message : ''
    const code = message.split('|', 1)[0]
    const statusByCode: Record<string, number> = {
      GUEST_ACCESS_DENIED: 401,
      GUEST_ACCESS_EXPIRED: 403,
      ADMIN_REQUIRED: 403,
      ORDER_NOT_FOUND: 404,
      MESSAGE_NOT_FOUND: 404,
      ATTACHMENT_NOT_FOUND: 404,
      ATTACHMENT_ACCESS_DENIED: 403,
      ATTACHMENT_PATH_DENIED: 403,
      CONVERSATION_UNAVAILABLE: 409,
      MENU_ACTIVE_EXISTS: 409,
      CATALOG_SELECTION_INVALID: 409,
      MENU_NOT_ACTIVE: 409,
      MENU_ITEM_NOT_ACTIVE: 409,
      INVALID_MENU: 400,
      INVALID_MENU_ITEM: 400,
      ONLINE_PAYMENT_REQUIRED: 409,
      EVIDENCE_EXPIRED: 410,
      INVALID_MESSAGE: 400,
      INVALID_REACTION: 400,
      INVALID_ATTACHMENT: 400,
      INVALID_ATTACHMENT_PURPOSE: 400,
    }
    if (code in statusByCode) {
      return jsonResponse(statusByCode[code], {
        error: { code, message: code.replaceAll('_', ' ').toLowerCase() },
      })
    }
    if (error.status === 401 || error.status === 403) {
      return jsonResponse(401, {
        error: {
          code: 'AUTHORIZATION_REQUIRED',
          message: 'Authorization failed.',
        },
      })
    }
  }
  return jsonResponse(500, {
    error: {
      code: 'REQUEST_FAILED',
      message: 'The request could not be completed.',
    },
  })
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > JSON_BODY_LIMIT) {
    throw new Error('REQUEST_TOO_LARGE')
  }
  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > JSON_BODY_LIMIT) {
    throw new Error('REQUEST_TOO_LARGE')
  }
  return JSON.parse(rawBody)
}
