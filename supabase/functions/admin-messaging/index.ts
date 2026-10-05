import {
  ALLOWED_MIME_TYPES,
  callRpc,
  corsHeaders,
  createSignedUrl,
  detectImageMime,
  deleteObject,
  extensionForMime,
  getEnvironment,
  jsonResponse,
  MAX_FILE_BYTES,
  readJsonBody,
  RpcFailure,
  safeError,
  SIGNED_URL_SECONDS,
  uploadObject,
} from '../_shared/messaging.ts'
import {
  clientNetworkIdentity,
  enforceRateLimit,
  RateLimitFailure,
  rateLimitResponse,
} from '../_shared/rate-limit.ts'

type AdminBody = {
  action?: string
  orderId?: string
  text?: string | null
  reaction?: string | null
  messageId?: string
  attachmentId?: string
  before?: string | null
  limit?: number
}

type UploadAuthorization = {
  order_id: string
  conversation_id: string | null
  bucket_id: string
}
type ReadAuthorization = { bucket_id: string; storage_path: string }

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function bearerToken(request: Request): string | null {
  const value = request.headers.get('authorization')
  return value?.startsWith('Bearer ') ? value.slice(7) : null
}

async function handleUpload(
  request: Request,
  userToken: string,
): Promise<Response> {
  const environment = getEnvironment()
  await Promise.all([
    enforceRateLimit(
      environment.url,
      environment.serviceKey,
      'admin:upload:ip',
      clientNetworkIdentity(request),
      30,
      600,
    ),
    enforceRateLimit(
      environment.url,
      environment.serviceKey,
      'admin:upload:session',
      userToken,
      20,
      600,
    ),
  ])
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
  const orderId = form.get('orderId')
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
    typeof orderId !== 'string' ||
    !uuidPattern.test(orderId) ||
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
  const authorization = await callRpc<UploadAuthorization>(
    environment.url,
    environment.anonKey,
    userToken,
    'admin_authorize_attachment_upload',
    { p_order_id: orderId, p_purpose: purpose },
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
      environment.anonKey,
      userToken,
      'admin_finalize_attachment',
      {
        p_order_id: orderId,
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

async function handleJson(
  request: Request,
  userToken: string,
): Promise<Response> {
  let body: AdminBody
  try {
    body = (await readJsonBody(request)) as AdminBody
  } catch {
    return jsonResponse(400, {
      error: { code: 'INVALID_REQUEST', message: 'Request body is invalid.' },
    })
  }
  const environment = getEnvironment()
  const safeAction =
    body.action && /^[a-z_]{1,30}$/u.test(body.action) ? body.action : 'invalid'
  await Promise.all([
    enforceRateLimit(
      environment.url,
      environment.serviceKey,
      `admin:${safeAction}:ip`,
      clientNetworkIdentity(request),
      120,
      600,
    ),
    enforceRateLimit(
      environment.url,
      environment.serviceKey,
      `admin:${safeAction}:session`,
      userToken,
      120,
      600,
    ),
  ])
  const rpc = <T>(name: string, parameters: Record<string, unknown>) =>
    callRpc<T>(
      environment.url,
      environment.anonKey,
      userToken,
      name,
      parameters,
    )

  if (
    body.action === 'list_messages' &&
    body.orderId &&
    uuidPattern.test(body.orderId)
  ) {
    const limit = Number.isInteger(body.limit)
      ? Math.min(Math.max(body.limit as number, 1), 100)
      : 50
    return jsonResponse(
      200,
      await rpc('admin_list_messages', {
        p_order_id: body.orderId,
        p_before: body.before ?? null,
        p_limit: limit,
      }),
    )
  }
  if (
    body.action === 'send_message' &&
    body.orderId &&
    uuidPattern.test(body.orderId)
  ) {
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
      await rpc('admin_send_message', {
        p_order_id: body.orderId,
        p_text: body.text.trim(),
      }),
    )
  }
  if (
    body.action === 'react' &&
    body.messageId &&
    uuidPattern.test(body.messageId)
  ) {
    await rpc('admin_set_message_reaction', {
      p_message_id: body.messageId,
      p_reaction: body.reaction ?? null,
    })
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (
    body.action === 'signed_read' &&
    body.attachmentId &&
    uuidPattern.test(body.attachmentId)
  ) {
    const authorization = await rpc<ReadAuthorization>(
      'admin_authorize_attachment_read',
      {
        p_attachment_id: body.attachmentId,
      },
    )
    const signedUrl = await createSignedUrl(
      environment.url,
      environment.serviceKey,
      authorization.bucket_id,
      authorization.storage_path,
    )
    return jsonResponse(200, { signedUrl, expiresIn: SIGNED_URL_SECONDS })
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
  const userToken = bearerToken(request)
  if (!userToken)
    return jsonResponse(401, {
      error: {
        code: 'AUTHORIZATION_REQUIRED',
        message: 'Admin authorization is required.',
      },
    })
  try {
    const contentType = request.headers.get('content-type') ?? ''
    return contentType.startsWith('multipart/form-data')
      ? await handleUpload(request, userToken)
      : await handleJson(request, userToken)
  } catch (error) {
    if (error instanceof RateLimitFailure)
      return rateLimitResponse(error, corsHeaders)
    if (error instanceof RpcFailure) return safeError(error)
    return safeError(error)
  }
})
