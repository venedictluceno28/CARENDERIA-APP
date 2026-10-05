import {
  ALLOWED_MIME_TYPES,
  callRpc,
  corsHeaders,
  createSignedUrl,
  detectImageMime,
  deleteObject,
  extensionForMime,
  getEnvironment,
  hashGuestToken,
  jsonResponse,
  MAX_FILE_BYTES,
  readJsonBody,
  RpcFailure,
  safeError,
  SIGNED_URL_SECONDS,
  uploadObject,
  validateGuestIdentity,
} from '../_shared/messaging.ts'
import {
  clientNetworkIdentity,
  enforceRateLimit,
  RateLimitFailure,
  rateLimitResponse,
} from '../_shared/rate-limit.ts'

type GuestBody = {
  action?: string
  orderCode?: string
  guestToken?: string
  text?: string | null
  reaction?: string | null
  messageId?: string
  attachmentId?: string
  before?: string | null
  limit?: number
}

type UploadAuthorization = {
  order_id: string
  conversation_id: string
  bucket_id: string
}

type ReadAuthorization = { bucket_id: string; storage_path: string }

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

async function handleUpload(request: Request): Promise<Response> {
  const environment = getEnvironment()
  await enforceRateLimit(
    environment.url,
    environment.serviceKey,
    'guest:upload:ip',
    clientNetworkIdentity(request),
    6,
    600,
  )
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_FILE_BYTES + 65_536
  ) {
    return jsonResponse(413, {
      error: { code: 'FILE_TOO_LARGE', message: 'Image exceeds 5 MiB.' },
    })
  }

  const form = await request.formData()
  const orderCode = form.get('orderCode')
  const guestToken = form.get('guestToken')
  const purpose = form.get('purpose')
  const text = form.get('text')
  const file = form.get('file')
  if (!(file instanceof File) || !ALLOWED_MIME_TYPES.has(file.type)) {
    return jsonResponse(400, {
      error: {
        code: 'INVALID_FILE_TYPE',
        message: 'Image type is not allowed.',
      },
    })
  }
  if (file.size < 1 || file.size > MAX_FILE_BYTES) {
    return jsonResponse(413, {
      error: { code: 'FILE_TOO_LARGE', message: 'Image exceeds 5 MiB.' },
    })
  }
  if (
    !validateGuestIdentity(orderCode, guestToken) ||
    (purpose !== 'CHAT_IMAGE' && purpose !== 'PAYMENT_EVIDENCE') ||
    (text !== null && (typeof text !== 'string' || text.trim().length > 2000))
  ) {
    return jsonResponse(400, {
      error: { code: 'INVALID_UPLOAD', message: 'Upload request is invalid.' },
    })
  }

  if ((await detectImageMime(file)) !== file.type) {
    return jsonResponse(400, {
      error: {
        code: 'INVALID_IMAGE_CONTENT',
        message: 'Image content does not match its declared type.',
      },
    })
  }

  const tokenHash = await hashGuestToken(guestToken)
  await enforceRateLimit(
    environment.url,
    environment.serviceKey,
    'guest:upload:token',
    tokenHash,
    6,
    600,
  )
  const authorization = await callRpc<UploadAuthorization>(
    environment.url,
    environment.serviceKey,
    environment.serviceKey,
    'guest_authorize_attachment_upload',
    {
      p_order_code: orderCode.trim().toUpperCase(),
      p_guest_token_hash: tokenHash,
      p_purpose: purpose,
    },
  )
  const attachmentId = crypto.randomUUID()
  const extension = extensionForMime(file.type)
  if (!extension) throw new Error('INVALID_MIME')
  const folder = purpose === 'PAYMENT_EVIDENCE' ? 'evidence' : 'messages'
  const storagePath = `orders/${authorization.order_id}/${folder}/${attachmentId}.${extension}`

  await uploadObject(
    environment.url,
    environment.serviceKey,
    authorization.bucket_id,
    storagePath,
    file,
  )
  try {
    const result = await callRpc<Record<string, unknown>>(
      environment.url,
      environment.serviceKey,
      environment.serviceKey,
      'guest_finalize_attachment',
      {
        p_order_code: orderCode.trim().toUpperCase(),
        p_guest_token_hash: tokenHash,
        p_attachment_id: attachmentId,
        p_storage_path: storagePath,
        p_mime_type: file.type,
        p_size_bytes: file.size,
        p_purpose: purpose,
        p_text: typeof text === 'string' && text.trim() ? text.trim() : null,
      },
    )
    return jsonResponse(201, result)
  } catch (error) {
    await deleteObject(
      environment.url,
      environment.serviceKey,
      authorization.bucket_id,
      storagePath,
    )
    throw error
  }
}

async function handleJson(request: Request): Promise<Response> {
  let body: GuestBody
  try {
    body = (await readJsonBody(request)) as GuestBody
  } catch {
    return jsonResponse(400, {
      error: { code: 'INVALID_REQUEST', message: 'Request body is invalid.' },
    })
  }
  if (!validateGuestIdentity(body.orderCode, body.guestToken)) {
    return jsonResponse(401, {
      error: { code: 'GUEST_ACCESS_DENIED', message: 'Guest access denied.' },
    })
  }
  const environment = getEnvironment()
  const tokenHash = await hashGuestToken(body.guestToken)
  const limits: Record<string, { limit: number; window: number }> = {
    receipt: { limit: 30, window: 600 },
    list_messages: { limit: 60, window: 600 },
    send_message: { limit: 20, window: 60 },
    react: { limit: 30, window: 60 },
    signed_read: { limit: 30, window: 600 },
  }
  const selectedLimit = limits[body.action ?? ''] ?? { limit: 20, window: 600 }
  const safeAction =
    body.action && /^[a-z_]{1,30}$/u.test(body.action) ? body.action : 'invalid'
  await Promise.all([
    enforceRateLimit(
      environment.url,
      environment.serviceKey,
      `guest:${safeAction}:ip`,
      clientNetworkIdentity(request),
      selectedLimit.limit,
      selectedLimit.window,
    ),
    enforceRateLimit(
      environment.url,
      environment.serviceKey,
      `guest:${safeAction}:token`,
      tokenHash,
      selectedLimit.limit,
      selectedLimit.window,
    ),
  ])
  const baseParameters = {
    p_order_code: body.orderCode.trim().toUpperCase(),
    p_guest_token_hash: tokenHash,
  }

  if (body.action === 'receipt') {
    return jsonResponse(
      200,
      await callRpc(
        environment.url,
        environment.serviceKey,
        environment.serviceKey,
        'guest_get_receipt',
        baseParameters,
      ),
    )
  }
  if (body.action === 'list_messages') {
    const limit = Number.isInteger(body.limit)
      ? Math.min(Math.max(body.limit as number, 1), 100)
      : 50
    return jsonResponse(
      200,
      await callRpc(
        environment.url,
        environment.serviceKey,
        environment.serviceKey,
        'guest_list_messages',
        {
          ...baseParameters,
          p_before: body.before ?? null,
          p_limit: limit,
        },
      ),
    )
  }
  if (body.action === 'send_message') {
    if (
      typeof body.text !== 'string' ||
      body.text.trim().length < 1 ||
      body.text.trim().length > 2000
    ) {
      return jsonResponse(400, {
        error: { code: 'INVALID_MESSAGE', message: 'Message is invalid.' },
      })
    }
    return jsonResponse(
      201,
      await callRpc(
        environment.url,
        environment.serviceKey,
        environment.serviceKey,
        'guest_send_message',
        { ...baseParameters, p_text: body.text.trim() },
      ),
    )
  }
  if (body.action === 'react') {
    if (!body.messageId || !uuidPattern.test(body.messageId)) {
      return jsonResponse(400, {
        error: { code: 'INVALID_REACTION', message: 'Reaction is invalid.' },
      })
    }
    await callRpc(
      environment.url,
      environment.serviceKey,
      environment.serviceKey,
      'guest_set_message_reaction',
      {
        ...baseParameters,
        p_message_id: body.messageId,
        p_reaction: body.reaction ?? null,
      },
    )
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (body.action === 'signed_read') {
    if (!body.attachmentId || !uuidPattern.test(body.attachmentId)) {
      return jsonResponse(400, {
        error: {
          code: 'INVALID_ATTACHMENT',
          message: 'Attachment is invalid.',
        },
      })
    }
    const authorization = await callRpc<ReadAuthorization>(
      environment.url,
      environment.serviceKey,
      environment.serviceKey,
      'guest_authorize_attachment_read',
      { ...baseParameters, p_attachment_id: body.attachmentId },
    )
    const signedUrl = await createSignedUrl(
      environment.url,
      environment.serviceKey,
      authorization.bucket_id,
      authorization.storage_path,
    )
    return jsonResponse(200, {
      signedUrl,
      expiresIn: SIGNED_URL_SECONDS,
    })
  }
  return jsonResponse(400, {
    error: { code: 'INVALID_ACTION', message: 'Action is invalid.' },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST')
    return jsonResponse(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' },
    })
  try {
    const contentType = request.headers.get('content-type') ?? ''
    return contentType.startsWith('multipart/form-data')
      ? await handleUpload(request)
      : await handleJson(request)
  } catch (error) {
    if (error instanceof RateLimitFailure)
      return rateLimitResponse(error, corsHeaders)
    if (error instanceof RpcFailure) return safeError(error)
    return safeError(error)
  }
})
