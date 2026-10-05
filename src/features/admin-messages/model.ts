import type {
  AdminConversationFilter,
  AdminConversationPage,
  AdminMessage,
  AdminMessagePage,
} from './types.ts'

export const ADMIN_MESSAGE_LIMIT = 50
export const ADMIN_REPLY_MAX_LENGTH = 2_000

export const adminMessageQueryKeys = {
  all: ['admin-messages'] as const,
  conversations: (search: string, filter: AdminConversationFilter) =>
    ['admin-messages', 'conversations', search, filter] as const,
  context: (orderId: string) => ['admin-messages', 'context', orderId] as const,
  messages: (orderId: string) =>
    ['admin-messages', 'history', orderId] as const,
}

export function mergeConversationPages(
  pages: AdminConversationPage[],
): AdminConversationPage['conversations'] {
  const byId = new Map(
    pages.flatMap((page) =>
      page.conversations.map(
        (conversation) => [conversation.conversation_id, conversation] as const,
      ),
    ),
  )
  return [...byId.values()].sort(
    (left, right) =>
      Date.parse(right.last_message_at) - Date.parse(left.last_message_at) ||
      right.conversation_id.localeCompare(left.conversation_id),
  )
}

export function mergeAdminMessagePages(
  pages: AdminMessagePage[],
): AdminMessage[] {
  const byId = new Map<string, AdminMessage>()
  for (const page of pages) {
    for (const message of page.messages) byId.set(message.id, message)
  }
  return [...byId.values()].sort(
    (left, right) =>
      Date.parse(left.created_at) - Date.parse(right.created_at) ||
      left.id.localeCompare(right.id),
  )
}

export function canSendAdminReply(text: string): boolean {
  const length = text.trim().length
  return length > 0 && length <= ADMIN_REPLY_MAX_LENGTH
}

export function isGuestChatActive(expiresAt: string, now = new Date()) {
  return Date.parse(expiresAt) > now.getTime()
}

export function adminPaymentAction(context: {
  payment_method: 'CASH' | 'ONLINE_PAYMENT'
  payment_verification_state: 'NOT_VERIFIED' | 'VERIFIED' | null
}): 'verify' | 'reverse' | null {
  if (context.payment_method === 'CASH') return null
  return context.payment_verification_state === 'VERIFIED'
    ? 'reverse'
    : 'verify'
}
