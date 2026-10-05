import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { URL } from 'node:url'
import {
  adminConversationTopic,
  guestConversationTopic,
} from '../../src/lib/realtime/realtime-topics.ts'
import { adminModules } from '../../src/features/admin-auth/admin-modules.ts'

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

test('conversation topics are narrow and contain no guest credential', () => {
  assert.equal(
    guestConversationTopic('conversation-a'),
    'order-messages:conversation-a',
  )
  assert.equal(
    adminConversationTopic('conversation-a'),
    'admin-conversation:conversation-a',
  )
  assert.doesNotMatch(guestConversationTopic('conversation-a'), /token/iu)
})

test('realtime signals refetch through authoritative query boundaries', () => {
  const customer = read(
    '../../src/features/customer-ordering/components/MessageBoundaryPage.tsx',
  )
  const inbox = read(
    '../../src/features/admin-messages/components/AdminMessagesPage.tsx',
  )
  const detail = read(
    '../../src/features/admin-messages/components/AdminConversationPage.tsx',
  )

  assert.match(customer, /useAuthoritativeRealtime/u)
  assert.match(customer, /guestConversationTopic\(conversationId\)/u)
  assert.match(customer, /\['guest', 'messages', identity\.orderCode\]/u)
  assert.match(customer, /\['guest', 'receipt', identity\.orderCode\]/u)
  assert.match(inbox, /topic: 'admin-messages'/u)
  assert.match(inbox, /privateChannel: true/u)
  assert.match(inbox, /adminMessageQueryKeys\.all/u)
  assert.match(detail, /adminConversationTopic\(conversationId\)/u)
  assert.match(detail, /adminMessageQueryKeys\.messages\(orderId\)/u)
  assert.match(detail, /adminMessageQueryKeys\.context\(orderId\)/u)
})

test('subscription lifecycle recovers and removes its channel', () => {
  const hook = read('../../src/lib/realtime/use-authoritative-realtime.ts')
  assert.match(hook, /\.on\('broadcast', \{ event: 'activity' \}/u)
  assert.match(hook, /status !== 'SUBSCRIBED'/u)
  assert.match(hook, /signalRef\.current\('reconnected'\)/u)
  assert.match(hook, /addEventListener\('focus', recover\)/u)
  assert.match(hook, /addEventListener\('online', recover\)/u)
  assert.match(hook, /visibilitychange/u)
  assert.match(hook, /window\.setTimeout[\s\S]*1_000/u)
  assert.match(hook, /removeChannel\(channel\)/u)
})

test('messenger semantics, wrapping, viewer, and jump affordances are explicit', () => {
  const customer = read(
    '../../src/features/customer-ordering/components/MessageBoundaryPage.tsx',
  )
  const admin = read(
    '../../src/features/admin-messages/components/AdminConversationPage.tsx',
  )
  const styles = read('../../src/styles/index.css')

  assert.match(styles, /\.message-row--guest[\s\S]*justify-content: flex-end/u)
  assert.match(
    styles,
    /\.message-row--admin[\s\S]*justify-content: flex-start/u,
  )
  assert.match(styles, /\.admin-message--admin[\s\S]*align-self: flex-end/u)
  assert.match(styles, /\.admin-message--guest[\s\S]*align-self: flex-start/u)
  assert.match(
    styles,
    /\.message-row--guest \.message-bubble[\s\S]*--foreground-on-dark/u,
  )
  assert.match(styles, /\.message-bubble > p[\s\S]*overflow-wrap: anywhere/u)
  assert.match(customer, /Open larger view/u)
  assert.match(customer, /New message ↓/u)
  assert.match(admin, /New message ↓/u)
  assert.match(admin, /PAYMENT RECEIPT/u)
})

test('all implemented dashboard modules share active semantics while Settings stays disabled', () => {
  const shell = read(
    '../../src/features/admin-auth/components/AdminShellPage.tsx',
  )
  const expectedActive = [
    'ULAM POST',
    'ULAM PHOTOS',
    'MESSAGE',
    'ADDRESS BOOK',
    'MANUAL ORDER',
    'TODAY’S ORDERS',
  ]
  assert.deepEqual(
    adminModules
      .filter((module) => module.enabled)
      .map((module) => module.title),
    expectedActive,
  )
  assert.deepEqual(
    adminModules
      .filter((module) => !module.enabled)
      .map((module) => module.title),
    ['SETTINGS'],
  )
  assert.match(shell, /admin-module--enabled/u)
  assert.match(shell, /admin-module--disabled/u)
  assert.match(shell, /disabled=\{!module\.enabled\}/u)
  assert.match(shell, /Coming later/u)
})
