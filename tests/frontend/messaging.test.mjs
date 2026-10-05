import assert from 'node:assert/strict'
import test from 'node:test'
import { AppError } from '../../src/lib/api/errors.ts'
import {
  canSubmitMessage,
  guestPaymentStatus,
  MAX_IMAGE_BYTES,
  mergeMessagePages,
  messagingErrorMessage,
  nextGuestReaction,
  showsPaymentEvidenceAction,
  validateSelectedImage,
} from '../../src/features/customer-ordering/messaging/messaging-model.ts'

const attachment = {
  id: 'attachment-1',
  purpose: 'CHAT_IMAGE',
  mime_type: 'image/png',
  size_bytes: 1200,
  created_at: '2026-10-03T01:01:00Z',
}

const guestMessage = {
  id: 'message-guest',
  sender_type: 'GUEST',
  text: 'Hello store',
  guest_reaction: null,
  admin_reaction: null,
  created_at: '2026-10-03T01:02:00Z',
  attachments: [],
}

const adminMessage = {
  id: 'message-admin',
  sender_type: 'ADMIN',
  text: 'We received your message.',
  guest_reaction: '👍',
  admin_reaction: null,
  created_at: '2026-10-03T01:03:00Z',
  attachments: [attachment],
}

test('message composer allows text, attachment-only, and combined sends', () => {
  assert.equal(canSubmitMessage('Hello', false), true)
  assert.equal(canSubmitMessage('', true), true)
  assert.equal(canSubmitMessage('Caption', true), true)
  assert.equal(canSubmitMessage('   ', false), false)
  assert.equal(canSubmitMessage('x'.repeat(2001), false), false)
})

test('image selection accepts supported images and rejects unsafe client inputs', () => {
  assert.equal(
    validateSelectedImage({ name: 'fake.png', type: 'image/png', size: 1200 }),
    null,
  )
  assert.equal(
    validateSelectedImage({
      name: 'large.webp',
      type: 'image/webp',
      size: MAX_IMAGE_BYTES + 1,
    }),
    'Image must be 5 MB or smaller.',
  )
  assert.equal(
    validateSelectedImage({
      name: 'document.pdf',
      type: 'application/pdf',
      size: 100,
    }),
    'Choose a JPEG, PNG, or WebP image.',
  )
})

test('message pages merge chronologically and preserve admin sender semantics', () => {
  const messages = mergeMessagePages([
    {
      conversation_id: 'conversation',
      expires_at: '2026-10-04T01:00:00Z',
      messages: [adminMessage, guestMessage],
    },
    {
      conversation_id: 'conversation',
      expires_at: '2026-10-04T01:00:00Z',
      messages: [guestMessage],
    },
  ])
  assert.deepEqual(
    messages.map((message) => message.id),
    ['message-guest', 'message-admin'],
  )
  assert.equal(messages[1].sender_type, 'ADMIN')
  assert.equal(messages[1].attachments[0].purpose, 'CHAT_IMAGE')
})

test('payment evidence is emphasized only for online payment', () => {
  assert.equal(
    showsPaymentEvidenceAction({ payment_method: 'ONLINE_PAYMENT' }),
    true,
  )
  assert.equal(showsPaymentEvidenceAction({ payment_method: 'CASH' }), false)
})

test('evidence upload does not imply verification and server status stays authoritative', () => {
  assert.equal(
    guestPaymentStatus({
      payment_method: 'ONLINE_PAYMENT',
      payment_verification_state: 'NOT_VERIFIED',
    }),
    'Not Verified',
  )
  assert.equal(
    guestPaymentStatus({
      payment_method: 'ONLINE_PAYMENT',
      payment_verification_state: 'VERIFIED',
    }),
    'Verified',
  )
  assert.equal(
    guestPaymentStatus({
      payment_method: 'CASH',
      payment_verification_state: null,
    }),
    null,
  )
})

test('reaction selection replaces or clears the guest reaction', () => {
  assert.equal(nextGuestReaction(null, '👍'), '👍')
  assert.equal(nextGuestReaction('👍', '❤️'), '❤️')
  assert.equal(nextGuestReaction('👍', '👍'), null)
})

test('messaging errors are safe and actionable', () => {
  assert.match(
    messagingErrorMessage(
      new AppError('RATE_LIMITED', 'rate limited', 429, {
        retryAfterSeconds: 12,
      }),
    ),
    /12 seconds/,
  )
  assert.match(
    messagingErrorMessage(new AppError('GUEST_ACCESS_EXPIRED', 'expired')),
    /no longer available/,
  )
  assert.match(
    messagingErrorMessage(new AppError('GUEST_ACCESS_DENIED', 'denied')),
    /no longer available/,
  )
  assert.match(
    messagingErrorMessage(new AppError('NETWORK_ERROR', 'offline')),
    /draft is still here/,
  )
  assert.match(
    messagingErrorMessage(
      new AppError('INVALID_IMAGE_CONTENT', 'content mismatch'),
    ),
    /could not be accepted/,
  )
})
