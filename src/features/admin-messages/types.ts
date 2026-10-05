export type AdminConversationFilter =
  | 'ALL'
  | 'ONLINE_PAYMENT'
  | 'NOT_VERIFIED'
  | 'VERIFIED'
  | 'ACTIVE_GUEST'
  | 'EXPIRED_GUEST'

export type AdminConversationSummary = {
  conversation_id: string
  order_id: string
  order_code: string
  customer_name: string
  payment_method: 'CASH' | 'ONLINE_PAYMENT'
  payment_verification_state: 'NOT_VERIFIED' | 'VERIFIED' | null
  verified_at: string | null
  order_created_at: string
  guest_chat_expires_at: string
  last_message_id: string
  last_sender_type: 'GUEST' | 'ADMIN'
  last_message_preview: string
  last_message_at: string
}

export type AdminConversationPage = {
  conversations: AdminConversationSummary[]
  next_before: string | null
}

export type AdminConversationContext = {
  id: string
  order_code: string
  customer_name: string
  payment_method: 'CASH' | 'ONLINE_PAYMENT'
  payment_verification_state: 'NOT_VERIFIED' | 'VERIFIED' | null
  verified_at: string | null
  created_at: string
  guest_chat_expires_at: string
}

export type AdminMessageAttachment = {
  id: string
  purpose: 'CHAT_IMAGE' | 'PAYMENT_EVIDENCE'
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp'
  size_bytes: number
  created_at: string
  retained_until: string | null
}

export type AdminMessage = {
  id: string
  sender_type: 'GUEST' | 'ADMIN'
  text: string | null
  guest_reaction: string | null
  admin_reaction: string | null
  created_at: string
  attachments: AdminMessageAttachment[]
}

export type AdminMessagePage = {
  conversation_id: string
  expires_at: string
  messages: AdminMessage[]
}
