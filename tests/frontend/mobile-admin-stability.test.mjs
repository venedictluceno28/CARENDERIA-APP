import assert from 'node:assert/strict'
import test from 'node:test'
import { createSecureUuid } from '../../src/lib/secure-random-uuid.ts'

test('uses native randomUUID when the secure-context API is available', () => {
  let called = 0
  const value = createSecureUuid({
    randomUUID() {
      called += 1
      return 'native-secure-uuid'
    },
    getRandomValues() {
      throw new Error('fallback should not run')
    },
  })
  assert.equal(value, 'native-secure-uuid')
  assert.equal(called, 1)
})

test('creates a cryptographically sourced RFC 4122 UUID on insecure LAN origins', () => {
  let requestedBytes = 0
  const value = createSecureUuid({
    getRandomValues(array) {
      requestedBytes = array.byteLength
      for (let index = 0; index < array.byteLength; index += 1) {
        array[index] = index
      }
      return array
    },
  })
  assert.equal(requestedBytes, 16)
  assert.equal(value, '00010203-0405-4607-8809-0a0b0c0d0e0f')
  assert.match(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  )
})
