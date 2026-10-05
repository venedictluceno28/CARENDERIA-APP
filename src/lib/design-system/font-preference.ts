export const FONT_PREFERENCES = ['normal', 'large', 'extra-large'] as const
export type FontPreference = (typeof FONT_PREFERENCES)[number]

const STORAGE_KEY = 'tindahan.font-size.v1'

export function isFontPreference(value: unknown): value is FontPreference {
  return (
    typeof value === 'string' &&
    FONT_PREFERENCES.includes(value as FontPreference)
  )
}

export function readFontPreference(): FontPreference {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY)
    return isFontPreference(value) ? value : 'normal'
  } catch {
    return 'normal'
  }
}

export function saveFontPreference(value: FontPreference): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value)
  } catch {
    // Persistence is a convenience; the active in-memory preference still works.
  }
}
