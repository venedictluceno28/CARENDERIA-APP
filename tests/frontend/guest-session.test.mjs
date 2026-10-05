import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

class MemoryStorage {
  values = new Map()
  getItem(key) {
    return this.values.get(key) ?? null
  }
  setItem(key, value) {
    this.values.set(key, value)
  }
  removeItem(key) {
    this.values.delete(key)
  }
  clear() {
    this.values.clear()
  }
}

globalThis.window = {}
globalThis.localStorage = new MemoryStorage()

const {
  clearGuestOrderSession,
  getGuestOrderSession,
  getGuestOrderSessionStatus,
  saveGuestOrderSession,
} = await import('../../src/lib/guest-session.ts')

const token = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
const future = () => new Date(Date.now() + 60_000).toISOString()

beforeEach(() => globalThis.localStorage.clear())

test('restores a valid credential only for its matching order', () => {
  saveGuestOrderSession({
    orderCode: 'crd-abcdefghjk',
    guestToken: token,
    expiresAt: future(),
  })
  assert.equal(getGuestOrderSession('CRD-ABCDEFGHJK')?.guestToken, token)
  assert.equal(getGuestOrderSession('CRD-KLMNPQRSTU'), null)
})

test('expired credentials are ignored and removed', () => {
  globalThis.localStorage.setItem(
    'carenderia.guest-orders.v1',
    JSON.stringify([
      {
        orderCode: 'CRD-ABCDEFGHJK',
        guestToken: token,
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
    ]),
  )
  assert.deepEqual(getGuestOrderSessionStatus('CRD-ABCDEFGHJK'), {
    status: 'expired',
  })
  assert.equal(getGuestOrderSession('CRD-ABCDEFGHJK'), null)
  assert.equal(
    globalThis.localStorage.getItem('carenderia.guest-orders.v1'),
    '[]',
  )
})

test('session status distinguishes valid and unavailable guest access', () => {
  saveGuestOrderSession({
    orderCode: 'CRD-ABCDEFGHJK',
    guestToken: token,
    expiresAt: future(),
  })
  assert.equal(getGuestOrderSessionStatus('CRD-ABCDEFGHJK').status, 'valid')
  assert.deepEqual(getGuestOrderSessionStatus('CRD-KLMNPQRSTU'), {
    status: 'unavailable',
  })
})

test('malformed storage fails safely', () => {
  globalThis.localStorage.setItem('carenderia.guest-orders.v1', '{not-json')
  assert.equal(getGuestOrderSession('CRD-ABCDEFGHJK'), null)
})

test('invalid tokens and order codes are not persisted', () => {
  saveGuestOrderSession({
    orderCode: 'CRD-INVALID',
    guestToken: 'short',
    expiresAt: future(),
  })
  assert.equal(
    globalThis.localStorage.getItem('carenderia.guest-orders.v1'),
    null,
  )
})

test('clearing one order leaves a different valid order intact', () => {
  saveGuestOrderSession({
    orderCode: 'CRD-ABCDEFGHJK',
    guestToken: token,
    expiresAt: future(),
  })
  saveGuestOrderSession({
    orderCode: 'CRD-KLMNPQRSTU',
    guestToken: 'BCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr',
    expiresAt: future(),
  })
  clearGuestOrderSession('CRD-ABCDEFGHJK')
  assert.equal(getGuestOrderSession('CRD-ABCDEFGHJK'), null)
  assert.ok(getGuestOrderSession('CRD-KLMNPQRSTU'))
})
