import {
  getSupabaseClient,
  getSupabasePublicConfig,
} from '../../../lib/supabase/client.ts'
import { AppError, toAppError } from '../../../lib/api/errors.ts'
import type {
  AdminConversationContext,
  AdminConversationFilter,
  AdminConversationPage,
  AdminMessagePage,
} from '../types.ts'

function safeAdminMessageError(raw: string, fallback: string) {
  return new AppError(
    raw.includes('ADMIN_REQUIRED') ? 'ADMIN_REQUIRED' : 'UNKNOWN_ERROR',
    raw.includes('ADMIN_REQUIRED')
      ? 'Active administrator access is required.'
      : fallback,
  )
}

export async function listAdminConversations(options: {
  search: string
  filter: AdminConversationFilter
  before?: string
  limit?: number
}): Promise<AdminConversationPage> {
  const { data, error } = await getSupabaseClient().rpc(
    'admin_list_conversations',
    {
      p_search: options.search.trim() || null,
      p_filter: options.filter,
      p_before: options.before ?? null,
      p_limit: options.limit ?? 30,
    },
  )
  if (error)
    throw safeAdminMessageError(
      error.message,
      'The conversation list could not be loaded.',
    )
  return data as AdminConversationPage
}

export async function getAdminConversationContext(
  orderId: string,
): Promise<AdminConversationContext> {
  const { data, error } = await getSupabaseClient()
    .from('orders')
    .select(
      'id,order_code,customer_name,payment_method,payment_verification_state,verified_at,created_at,guest_chat_expires_at',
    )
    .eq('id', orderId)
    .eq('source', 'ONLINE')
    .single()
  if (error)
    throw safeAdminMessageError(
      error.message,
      'The conversation context could not be loaded.',
    )
  return data as AdminConversationContext
}

async function invokeAdminMessaging<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const client = getSupabaseClient()
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token)
    throw new AppError(
      'AUTHORIZATION_REQUIRED',
      'Admin authorization is required.',
    )
  const { url, anonKey } = getSupabasePublicConfig()
  let response: Response
  try {
    response = await fetch(`${url}/functions/v1/admin-messaging`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AppError(
      'NETWORK_ERROR',
      'The messaging server could not be reached.',
    )
  }
  if (response.status === 204) return undefined as T
  const payload = (await response.json().catch(() => ({}))) as unknown
  if (!response.ok) {
    const error = toAppError(payload, undefined, response.status)
    const retryAfter = Number(response.headers.get('Retry-After'))
    if (error.code === 'RATE_LIMITED' && Number.isFinite(retryAfter)) {
      throw new AppError(error.code, error.message, error.status, {
        retryAfterSeconds: Math.max(1, Math.round(retryAfter)),
      })
    }
    throw error
  }
  return payload as T
}

export const listAdminMessages = (
  orderId: string,
  options?: { before?: string; limit?: number },
) =>
  invokeAdminMessaging<AdminMessagePage>({
    action: 'list_messages',
    orderId,
    before: options?.before ?? null,
    limit: options?.limit ?? 50,
  })

export const sendAdminMessage = (orderId: string, text: string) =>
  invokeAdminMessaging({
    action: 'send_message',
    orderId,
    text: text.trim(),
  })

export async function getAdminMessageAttachmentUrl(attachmentId: string) {
  const result = await invokeAdminMessaging<{
    signedUrl: string
    expiresIn: number
  }>({ action: 'signed_read', attachmentId })
  return {
    url: new URL(result.signedUrl, getSupabasePublicConfig().url).toString(),
    expiresIn: result.expiresIn,
  }
}
