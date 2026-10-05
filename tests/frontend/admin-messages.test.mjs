import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { URL } from 'node:url'
import {
  ADMIN_REPLY_MAX_LENGTH,
  adminMessageQueryKeys,
  adminPaymentAction,
  canSendAdminReply,
  isGuestChatActive,
  mergeAdminMessagePages,
  mergeConversationPages,
} from '../../src/features/admin-messages/model.ts'

const conversation = (overrides = {}) => ({
  conversation_id: 'conversation-a',
  order_id: 'order-a',
  order_code: 'CRD-A',
  customer_name: 'Maria Customer',
  payment_method: 'ONLINE_PAYMENT',
  payment_verification_state: 'NOT_VERIFIED',
  verified_at: null,
  order_created_at: '2026-10-05T00:00:00Z',
  guest_chat_expires_at: '2026-10-06T00:00:00Z',
  last_message_id: 'message-a',
  last_sender_type: 'GUEST',
  last_message_preview: 'Payment sent',
  last_message_at: '2026-10-05T01:00:00Z',
  ...overrides,
})

test('uses stable inbox, context, and history query identities', () => {
  assert.deepEqual(adminMessageQueryKeys.all, ['admin-messages'])
  assert.deepEqual(adminMessageQueryKeys.conversations('maria', 'ALL'), [
    'admin-messages',
    'conversations',
    'maria',
    'ALL',
  ])
  assert.deepEqual(adminMessageQueryKeys.context('order-a'), [
    'admin-messages',
    'context',
    'order-a',
  ])
})

test('merges and sorts paginated conversations by latest activity', () => {
  const latest = conversation()
  const older = conversation({
    conversation_id: 'conversation-b',
    last_message_at: '2026-10-04T01:00:00Z',
  })
  const updated = conversation({ last_message_preview: 'Updated preview' })
  const result = mergeConversationPages([
    { conversations: [latest, older], next_before: 'cursor' },
    { conversations: [updated], next_before: null },
  ])
  assert.deepEqual(
    result.map((item) => item.conversation_id),
    ['conversation-a', 'conversation-b'],
  )
  assert.equal(result[0].last_message_preview, 'Updated preview')
})

test('renders message pages chronologically and deduplicates polling overlap', () => {
  const guest = {
    id: 'guest',
    sender_type: 'GUEST',
    text: 'Customer message',
    guest_reaction: null,
    admin_reaction: null,
    created_at: '2026-10-05T01:00:00Z',
    attachments: [],
  }
  const admin = {
    ...guest,
    id: 'admin',
    sender_type: 'ADMIN',
    text: 'Admin reply',
    created_at: '2026-10-05T02:00:00Z',
  }
  assert.deepEqual(
    mergeAdminMessagePages([
      { conversation_id: 'c', expires_at: 'x', messages: [admin] },
      { conversation_id: 'c', expires_at: 'x', messages: [guest, admin] },
    ]).map((message) => [message.id, message.sender_type]),
    [
      ['guest', 'GUEST'],
      ['admin', 'ADMIN'],
    ],
  )
})

test('blocks empty and overlong replies while accepting trimmed plain text', () => {
  assert.equal(canSendAdminReply('   '), false)
  assert.equal(canSendAdminReply(' Reply safely '), true)
  assert.equal(canSendAdminReply('x'.repeat(ADMIN_REPLY_MAX_LENGTH)), true)
  assert.equal(canSendAdminReply('x'.repeat(ADMIN_REPLY_MAX_LENGTH + 1)), false)
})

test('guest expiry and payment actions reflect backend state', () => {
  const now = new Date('2026-10-05T12:00:00Z')
  assert.equal(isGuestChatActive('2026-10-05T13:00:00Z', now), true)
  assert.equal(isGuestChatActive('2026-10-05T11:00:00Z', now), false)
  assert.equal(adminPaymentAction(conversation()), 'verify')
  assert.equal(
    adminPaymentAction(
      conversation({ payment_verification_state: 'VERIFIED' }),
    ),
    'reverse',
  )
  assert.equal(
    adminPaymentAction(
      conversation({
        payment_method: 'CASH',
        payment_verification_state: null,
      }),
    ),
    null,
  )
})

test('routes, deterministic Back, secure images, reply preservation, and View Order are wired', () => {
  const app = readFileSync(
    new URL('../../src/app/App.tsx', import.meta.url),
    'utf8',
  )
  const modules = readFileSync(
    new URL('../../src/features/admin-auth/admin-modules.ts', import.meta.url),
    'utf8',
  )
  const detail = readFileSync(
    new URL(
      '../../src/features/admin-messages/components/AdminConversationPage.tsx',
      import.meta.url,
    ),
    'utf8',
  )
  assert.match(
    modules,
    /title: 'MESSAGE'[\s\S]*enabled: true[\s\S]*\/admin\/messages/u,
  )
  assert.match(app, /path="\/admin\/messages"[\s\S]*<AdminRouteGuard>/u)
  assert.match(
    app,
    /path="\/admin\/messages\/:orderId"[\s\S]*<AdminRouteGuard>/u,
  )
  assert.match(detail, /backTo="\/admin\/messages"/u)
  assert.match(detail, /state: \{ selectedOrderId: order\.id \}/u)
  assert.match(detail, /getAdminMessageAttachmentUrl\(attachment\.id\)/u)
  assert.match(detail, /onSuccess:[\s\S]*setReply\(''\)/u)
  assert.doesNotMatch(detail, /guestToken|service[_-]?role/iu)
})

test('payment evidence is visibly distinct and cash controls stay model-disabled', () => {
  const detail = readFileSync(
    new URL(
      '../../src/features/admin-messages/components/AdminConversationPage.tsx',
      import.meta.url,
    ),
    'utf8',
  )
  assert.match(detail, /PAYMENT RECEIPT/u)
  assert.match(detail, /Payment receipt/u)
  assert.match(detail, /paymentAction &&/u)
  assert.match(detail, /Mark Not Verified/u)
  assert.match(detail, /Mark Verified/u)
})
