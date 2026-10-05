import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isFontPreference,
  readFontPreference,
  saveFontPreference,
} from '../../src/lib/design-system/font-preference.ts'
import { formatDeliveryCharge, formatPeso } from '../../src/lib/format-money.ts'

test('formats integer centavos as readable Philippine peso values', () => {
  assert.equal(formatPeso(8000), '₱80')
  assert.equal(formatPeso(8050), '₱80.5')
  assert.equal(formatDeliveryCharge(0), 'FREE Delivery')
  assert.equal(formatDeliveryCharge(1500), '₱15 delivery')
})

test('validates the restrained font preference choices', () => {
  assert.equal(isFontPreference('normal'), true)
  assert.equal(isFontPreference('large'), true)
  assert.equal(isFontPreference('extra-large'), true)
  assert.equal(isFontPreference('huge'), false)
})

test('font preference persistence fails safely when storage is unavailable', () => {
  const original = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    },
  })
  assert.equal(readFontPreference(), 'normal')
  assert.doesNotThrow(() => saveFontPreference('large'))
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: original,
  })
})
