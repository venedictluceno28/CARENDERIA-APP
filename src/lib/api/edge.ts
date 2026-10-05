import { getSupabasePublicConfig } from '../supabase/client'
import { AppError, toAppError } from './errors'

export async function callPublicEdge<T>(
  functionName: string,
  body: BodyInit,
  contentType?: string,
): Promise<T> {
  const { url, anonKey } = getSupabasePublicConfig()
  let response: Response
  try {
    response = await fetch(`${url}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      body,
    })
  } catch {
    throw new AppError(
      'NETWORK_ERROR',
      'The server could not be reached. Please try again.',
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
