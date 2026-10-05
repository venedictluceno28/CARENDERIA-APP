import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  FONT_PREFERENCES,
  readFontPreference,
  saveFontPreference,
  type FontPreference,
} from '../../lib/design-system/font-preference'
import {
  FontPreferenceContext,
  useFontPreference,
} from './font-preference-context'

export function FontPreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] =
    useState<FontPreference>(readFontPreference)

  useEffect(() => {
    document.documentElement.dataset.fontSize = preference
    saveFontPreference(preference)
  }, [preference])

  const value = useMemo(() => ({ preference, setPreference }), [preference])
  return (
    <FontPreferenceContext.Provider value={value}>
      {children}
    </FontPreferenceContext.Provider>
  )
}

export function FontSizeControl() {
  const { preference, setPreference } = useFontPreference()
  const labels: Record<FontPreference, string> = {
    normal: 'Normal',
    large: 'Large',
    'extra-large': 'Extra large',
  }

  return (
    <fieldset className="font-size-control">
      <legend>Text size</legend>
      <div className="font-size-control__options">
        {FONT_PREFERENCES.map((option) => (
          <label key={option}>
            <input
              checked={preference === option}
              name="font-size"
              onChange={() => setPreference(option)}
              type="radio"
            />
            <span>{labels[option]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
