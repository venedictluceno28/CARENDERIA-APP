import {
  ALLOWED_MIME_TYPES,
  callRpc,
  corsHeaders,
  deleteObject,
  detectImageMime,
  extensionForMime,
  getEnvironment,
  jsonResponse,
  MAX_FILE_BYTES,
  RpcFailure,
  safeError,
  uploadObject,
} from '../_shared/messaging.ts'
import {
  clientNetworkIdentity,
  enforceRateLimit,
  RateLimitFailure,
  rateLimitResponse,
} from '../_shared/rate-limit.ts'

type UploadAuthorization = {
  menu_id: string
  bucket_id: 'public-assets'
  path_prefix: string
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function bearerToken(request: Request): string | null {
  const value = request.headers.get('authorization')
  return value?.startsWith('Bearer ') ? value.slice(7) : null
}

function selectedIds(value: FormDataEntryValue | null): string[] | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    if (
      !Array.isArray(parsed) ||
      parsed.length < 1 ||
      parsed.length > 100 ||
      parsed.some((id) => typeof id !== 'string' || !uuidPattern.test(id)) ||
      new Set(parsed).size !== parsed.length
    )
      return null
    return parsed
  } catch {
    return null
  }
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

  let uploaded:
    { url: string; key: string; bucket: string; path: string } | undefined
  try {
    const environment = getEnvironment()
    await Promise.all([
      enforceRateLimit(
        environment.url,
        environment.serviceKey,
        'admin:menu-publish:ip',
        clientNetworkIdentity(request),
        20,
        600,
      ),
      enforceRateLimit(
        environment.url,
        environment.serviceKey,
        'admin:menu-publish:session',
        userToken,
        10,
        600,
      ),
    ])
    const declaredLength = Number(request.headers.get('content-length') ?? '0')
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_FILE_BYTES + 65_536
    )
      return jsonResponse(413, {
        error: { code: 'FILE_TOO_LARGE', message: 'Image exceeds 5 MiB.' },
      })

    const form = await request.formData()
    const menuId = form.get('menuId')
    const catalogItemIds = selectedIds(form.get('catalogItemIds'))
    const file = form.get('file')
    if (
      typeof menuId !== 'string' ||
      !uuidPattern.test(menuId) ||
      !catalogItemIds ||
      !(file instanceof File)
    )
      return jsonResponse(400, {
        error: { code: 'INVALID_MENU', message: 'Menu details are invalid.' },
      })
    if (!ALLOWED_MIME_TYPES.has(file.type))
      return jsonResponse(400, {
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Image type is not allowed.',
        },
      })
    if (file.size < 1 || file.size > MAX_FILE_BYTES)
      return jsonResponse(413, {
        error: { code: 'FILE_TOO_LARGE', message: 'Image exceeds 5 MiB.' },
      })
    if ((await detectImageMime(file)) !== file.type)
      return jsonResponse(400, {
        error: {
          code: 'INVALID_IMAGE_CONTENT',
          message: 'Image content does not match its declared type.',
        },
      })

    const authorization = await callRpc<UploadAuthorization>(
      environment.url,
      environment.anonKey,
      userToken,
      'admin_authorize_menu_image_upload',
      { p_menu_id: menuId },
    )
    const extension = extensionForMime(file.type)
    if (!extension) throw new Error('INVALID_MIME')
    const imagePath = `${authorization.path_prefix}${crypto.randomUUID()}.${extension}`
    await uploadObject(
      environment.url,
      environment.serviceKey,
      authorization.bucket_id,
      imagePath,
      file,
    )
    uploaded = {
      url: environment.url,
      key: environment.serviceKey,
      bucket: authorization.bucket_id,
      path: imagePath,
    }
    await callRpc<string>(
      environment.url,
      environment.anonKey,
      userToken,
      'admin_publish_menu',
      {
        p_menu_id: menuId,
        p_image_path: imagePath,
        p_catalog_item_ids: catalogItemIds,
      },
    )
    return jsonResponse(201, { menuId })
  } catch (error) {
    if (uploaded) {
      try {
        await deleteObject(
          uploaded.url,
          uploaded.key,
          uploaded.bucket,
          uploaded.path,
        )
      } catch {
        // Cleanup is best effort; never mask the authoritative publish error.
      }
    }
    if (error instanceof RateLimitFailure)
      return rateLimitResponse(error, corsHeaders)
    if (error instanceof RpcFailure) return safeError(error)
    return safeError(error)
  }
})
