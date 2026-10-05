export function guestConversationTopic(conversationId: string) {
  return `order-messages:${conversationId}`
}

export function adminConversationTopic(conversationId: string) {
  return `admin-conversation:${conversationId}`
}
