import { createContext, useContext } from 'react'
import type { FontPreference } from '../../lib/design-system/font-preference'

export type FontPreferenceContextValue = {
  preference: FontPreference
  setPreference: (preference: FontPreference) => void
}

export const FontPreferenceContext =
  createContext<FontPreferenceContextValue | null>(null)

export function useFontPreference() {
  const value = useContext(FontPreferenceContext)
  if (!value)
    throw new Error(
      'useFontPreference must be used within FontPreferenceProvider.',
    )
  return value
}
