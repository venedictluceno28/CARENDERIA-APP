import { getSupabasePublicConfig } from './supabase/client.ts'

export function publicAssetUrl(path: string): string {
  const value = path.trim()
  if (/^(https?:|data:|blob:)/iu.test(value) || value.startsWith('/'))
    return value
  const normalized = value.replace(/^public-assets\//u, '')
  const { url } = getSupabasePublicConfig()
  return `${url}/storage/v1/object/public/public-assets/${normalized
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}
