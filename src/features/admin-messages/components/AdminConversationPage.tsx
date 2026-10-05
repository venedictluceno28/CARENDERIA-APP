import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { AdminPageHeader } from '../../../components/layout/AdminPageHeader.tsx'
import {
  AppBackground,
  PageContainer,
} from '../../../components/layout/Page.tsx'
import { Badge } from '../../../components/ui/Badge.tsx'
import { Button } from '../../../components/ui/Button.tsx'
import { Dialog } from '../../../components/ui/Dialog.tsx'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from '../../../components/ui/Feedback.tsx'
import { Textarea } from '../../../components/ui/FormControls.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { setAdminPaymentVerification } from '../../../lib/api/admin-operations.ts'
import { adminOrderQueryKeys } from '../../../lib/admin-order-queries.ts'
import { useAuthoritativeRealtime } from '../../../lib/realtime/use-authoritative-realtime.ts'
import { adminConversationTopic } from '../../../lib/realtime/realtime-topics.ts'
import { useAdminSession } from '../../admin-auth/index.ts'
import {
  getAdminConversationContext,
  getAdminMessageAttachmentUrl,
  listAdminMessages,
  sendAdminMessage,
} from '../api/admin-messages.ts'
import {
  ADMIN_MESSAGE_LIMIT,
  ADMIN_REPLY_MAX_LENGTH,
  adminMessageQueryKeys,
  adminPaymentAction,
  canSendAdminReply,
  isGuestChatActive,
  mergeAdminMessagePages,
} from '../model.ts'
import type { AdminMessage, AdminMessageAttachment } from '../types.ts'

function friendlyMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback
  if ('code' in error && error.code === 'RATE_LIMITED')
    return 'Too many requests were made. Wait a moment and try again.'
  if ('code' in error && error.code === 'NETWORK_ERROR')
    return 'The request was not confirmed. Check your connection and try again.'
  return error.message || fallback
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AdminConversationPage() {
  const { orderId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { signOut } = useAdminSession()
  const [reply, setReply] = useState('')
  const [notice, setNotice] = useState<string>()
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const [viewerAttachment, setViewerAttachment] =
    useState<AdminMessageAttachment | null>(null)
  const messageLogRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const initializedScrollRef = useRef(false)
  const forceLatestRef = useRef(false)
  const previousLastMessageRef = useRef<string | undefined>(undefined)

  const context = useQuery({
    queryKey: adminMessageQueryKeys.context(orderId),
    queryFn: () => getAdminConversationContext(orderId),
    enabled: Boolean(orderId),
    staleTime: 20_000,
  })
  const history = useInfiniteQuery({
    queryKey: adminMessageQueryKeys.messages(orderId),
    queryFn: ({ pageParam }) =>
      listAdminMessages(orderId, {
        before: pageParam,
        limit: ADMIN_MESSAGE_LIMIT,
      }),
    enabled: Boolean(orderId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.messages.length === ADMIN_MESSAGE_LIMIT
        ? page.messages[0]?.created_at
        : undefined,
    staleTime: 10_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
  const messages = useMemo(
    () => mergeAdminMessagePages(history.data?.pages ?? []),
    [history.data?.pages],
  )
  const lastMessageId = messages.at(-1)?.id
  const conversationId = history.data?.pages[0]?.conversation_id
  const refreshConversation = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: adminMessageQueryKeys.messages(orderId),
      }),
      queryClient.invalidateQueries({
        queryKey: adminMessageQueryKeys.context(orderId),
      }),
      queryClient.invalidateQueries({ queryKey: adminMessageQueryKeys.all }),
    ])
  }, [orderId, queryClient])

  useAuthoritativeRealtime({
    topic: conversationId ? adminConversationTopic(conversationId) : undefined,
    privateChannel: true,
    onSignal: refreshConversation,
  })

  useEffect(() => {
    const log = messageLogRef.current
    if (!log || !messages.length) return
    const latestChanged =
      Boolean(previousLastMessageRef.current) &&
      previousLastMessageRef.current !== lastMessageId
    if (
      !initializedScrollRef.current ||
      nearBottomRef.current ||
      forceLatestRef.current
    ) {
      log.scrollTop = log.scrollHeight
      initializedScrollRef.current = true
      forceLatestRef.current = false
      setHasNewMessage(false)
    } else if (latestChanged) {
      setHasNewMessage(true)
    }
    previousLastMessageRef.current = lastMessageId
  }, [lastMessageId, messages.length])

  const replyMutation = useMutation({
    mutationFn: () => sendAdminMessage(orderId, reply),
    onSuccess: async () => {
      setReply('')
      setNotice('Reply sent.')
      forceLatestRef.current = true
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminMessageQueryKeys.messages(orderId),
        }),
        queryClient.invalidateQueries({
          queryKey: adminMessageQueryKeys.all,
        }),
      ])
    },
  })
  const verificationMutation = useMutation({
    mutationFn: (verified: boolean) =>
      setAdminPaymentVerification(orderId, verified),
    onSuccess: async (_, verified) => {
      setNotice(
        verified
          ? 'Payment marked as Verified.'
          : 'Payment returned to Not Verified.',
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminMessageQueryKeys.context(orderId),
        }),
        queryClient.invalidateQueries({
          queryKey: adminMessageQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: adminOrderQueryKeys.detail(orderId),
        }),
        queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-daily-totals'] }),
      ])
    },
  })
  const imageMutation = useMutation({
    mutationFn: async (attachment: AdminMessageAttachment) => ({
      attachment,
      result: await getAdminMessageAttachmentUrl(attachment.id),
    }),
  })

  function submitReply(event: React.FormEvent) {
    event.preventDefault()
    if (!canSendAdminReply(reply)) return
    setNotice(undefined)
    replyMutation.mutate()
  }

  function openAttachment(attachment: AdminMessageAttachment) {
    setViewerAttachment(attachment)
    imageMutation.reset()
    imageMutation.mutate(attachment)
  }

  const order = context.data
  const paymentAction = order ? adminPaymentAction(order) : null
  const chatActive = order
    ? isGuestChatActive(order.guest_chat_expires_at)
    : false

  return (
    <AppBackground className="admin-background admin-conversation-background">
      <AdminPageHeader
        backTo="/admin/messages"
        onLogout={signOut}
        subtitle="Conversation"
      />
      <main>
        <PageContainer className="admin-conversation-shell">
          {context.isPending ? (
            <Skeleton className="conversation-context-skeleton" />
          ) : context.isError ? (
            <ErrorState
              description={friendlyMessage(
                context.error,
                'Unable to load this conversation.',
              )}
              onRetry={() => void context.refetch()}
            />
          ) : order ? (
            <>
              <header className="conversation-context">
                <div>
                  <p className="eyebrow">{order.order_code}</p>
                  <h1>{order.customer_name}</h1>
                  <p>Order-linked private conversation</p>
                </div>
                <Button
                  icon="receipt"
                  onClick={() =>
                    navigate('/admin/orders', {
                      state: { selectedOrderId: order.id },
                    })
                  }
                  variant="secondary"
                >
                  View order
                </Button>
                <div className="conversation-context__status">
                  <Badge variant="info">
                    {order.payment_method === 'CASH'
                      ? 'Cash'
                      : 'Online Payment'}
                  </Badge>
                  {order.payment_method === 'ONLINE_PAYMENT' && (
                    <Badge
                      variant={
                        order.payment_verification_state === 'VERIFIED'
                          ? 'verified'
                          : 'unverified'
                      }
                    >
                      {order.payment_verification_state === 'VERIFIED'
                        ? 'Verified'
                        : 'Not Verified'}
                    </Badge>
                  )}
                  <Badge variant={chatActive ? 'available' : 'cancelled'}>
                    Customer chat {chatActive ? 'active' : 'expired'}
                  </Badge>
                </div>
                <p className="conversation-context__expiry">
                  {chatActive
                    ? `Customer messaging closes ${dateTimeLabel(order.guest_chat_expires_at)}.`
                    : `Customer messaging expired ${dateTimeLabel(order.guest_chat_expires_at)}. Retained history remains available to admins.`}
                </p>
                {order.verified_at && (
                  <p className="conversation-context__verified">
                    Verified {dateTimeLabel(order.verified_at)}
                  </p>
                )}
                {paymentAction && (
                  <Button
                    loading={verificationMutation.isPending}
                    onClick={() => {
                      if (
                        paymentAction === 'reverse' &&
                        !window.confirm('Mark this payment Not Verified again?')
                      )
                        return
                      verificationMutation.mutate(paymentAction === 'verify')
                    }}
                    variant={paymentAction === 'reverse' ? 'ghost' : 'primary'}
                  >
                    {paymentAction === 'reverse'
                      ? 'Mark Not Verified'
                      : 'Mark Verified'}
                  </Button>
                )}
                {verificationMutation.isError && (
                  <p className="form-error" role="alert">
                    {friendlyMessage(
                      verificationMutation.error,
                      'Payment verification could not be updated.',
                    )}
                  </p>
                )}
              </header>

              {notice && (
                <p className="action-notice" role="status">
                  <Icon name="check" /> {notice}
                </p>
              )}

              <section className="admin-message-panel" aria-label="Messages">
                {history.hasNextPage && (
                  <Button
                    loading={history.isFetchingNextPage}
                    onClick={() => void history.fetchNextPage()}
                    variant="secondary"
                  >
                    Load earlier
                  </Button>
                )}
                {history.isPending ? (
                  <div className="admin-message-skeletons">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Skeleton
                        className="admin-message-skeleton"
                        key={index}
                      />
                    ))}
                  </div>
                ) : history.isError ? (
                  <ErrorState
                    description={friendlyMessage(
                      history.error,
                      'Unable to load messages.',
                    )}
                    onRetry={() => void history.refetch()}
                    title="Unable to load messages"
                  />
                ) : messages.length ? (
                  <div
                    aria-live="polite"
                    aria-relevant="additions"
                    className="admin-message-log"
                    onScroll={(event) => {
                      const target = event.currentTarget
                      nearBottomRef.current =
                        target.scrollHeight -
                          target.scrollTop -
                          target.clientHeight <
                        120
                      if (nearBottomRef.current) setHasNewMessage(false)
                    }}
                    ref={messageLogRef}
                    role="log"
                  >
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        onOpenAttachment={openAttachment}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    description="The order context remains available above."
                    icon="message"
                    title="No messages in this order yet"
                  />
                )}
                {hasNewMessage && (
                  <Button
                    className="jump-to-latest"
                    onClick={() => {
                      const log = messageLogRef.current
                      if (log) log.scrollTop = log.scrollHeight
                      nearBottomRef.current = true
                      setHasNewMessage(false)
                    }}
                    type="button"
                    variant="secondary"
                  >
                    New message ↓
                  </Button>
                )}
              </section>

              <form className="admin-reply-composer" onSubmit={submitReply}>
                <label htmlFor="admin-reply">Reply as store</label>
                <Textarea
                  id="admin-reply"
                  maxLength={ADMIN_REPLY_MAX_LENGTH}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Type a plain-text reply"
                  rows={4}
                  value={reply}
                />
                <div className="admin-reply-composer__footer">
                  <small>
                    {reply.length}/{ADMIN_REPLY_MAX_LENGTH}
                  </small>
                  <Button
                    disabled={!canSendAdminReply(reply)}
                    loading={replyMutation.isPending}
                    type="submit"
                  >
                    Send reply
                  </Button>
                </div>
                {replyMutation.isError && (
                  <p className="form-error" role="alert">
                    {friendlyMessage(
                      replyMutation.error,
                      'Unable to send reply. Your draft is still here.',
                    )}
                  </p>
                )}
              </form>
            </>
          ) : null}
        </PageContainer>
      </main>

      <Dialog
        description={
          viewerAttachment?.purpose === 'PAYMENT_EVIDENCE'
            ? 'Private payment evidence. The signed view expires shortly.'
            : 'Private customer image. The signed view expires shortly.'
        }
        onOpenChange={(open) => {
          if (!open) {
            setViewerAttachment(null)
            imageMutation.reset()
          }
        }}
        open={Boolean(viewerAttachment)}
        title={
          viewerAttachment?.purpose === 'PAYMENT_EVIDENCE'
            ? 'Payment receipt'
            : 'Customer image'
        }
      >
        {imageMutation.isPending ? (
          <LoadingState label="Opening private image…" />
        ) : imageMutation.isError ? (
          <ErrorState
            description={friendlyMessage(
              imageMutation.error,
              'Unable to open image.',
            )}
            onRetry={() =>
              viewerAttachment && imageMutation.mutate(viewerAttachment)
            }
            title="Unable to open image"
          />
        ) : imageMutation.data ? (
          <img
            alt={
              imageMutation.data.attachment.purpose === 'PAYMENT_EVIDENCE'
                ? 'Customer payment receipt'
                : 'Customer message attachment'
            }
            className="admin-private-image"
            src={imageMutation.data.result.url}
          />
        ) : null}
      </Dialog>
    </AppBackground>
  )
}

function MessageBubble({
  message,
  onOpenAttachment,
}: {
  message: AdminMessage
  onOpenAttachment: (attachment: AdminMessageAttachment) => void
}) {
  const sender = message.sender_type === 'GUEST' ? 'Customer' : 'Store'
  return (
    <article
      className={`admin-message admin-message--${message.sender_type.toLowerCase()}`}
    >
      <header>
        <strong>{sender}</strong>
        <time dateTime={message.created_at}>
          {dateTimeLabel(message.created_at)}
        </time>
      </header>
      {message.text && <p>{message.text}</p>}
      {message.attachments.map((attachment) => (
        <button
          aria-label={
            attachment.purpose === 'PAYMENT_EVIDENCE'
              ? 'Open private payment receipt'
              : 'Open private customer image'
          }
          className={`admin-message-attachment${
            attachment.purpose === 'PAYMENT_EVIDENCE'
              ? ' admin-message-attachment--evidence'
              : ''
          }`}
          key={attachment.id}
          onClick={() => onOpenAttachment(attachment)}
          type="button"
        >
          <Icon
            name={
              attachment.purpose === 'PAYMENT_EVIDENCE' ? 'receipt' : 'image'
            }
          />
          <span>
            <strong>
              {attachment.purpose === 'PAYMENT_EVIDENCE'
                ? 'PAYMENT RECEIPT'
                : 'Private image'}
            </strong>
            <small>Tap to open securely</small>
          </span>
        </button>
      ))}
      {(message.guest_reaction || message.admin_reaction) && (
        <footer className="admin-message__reactions">
          {message.guest_reaction && (
            <span>Customer reacted {message.guest_reaction}</span>
          )}
          {message.admin_reaction && (
            <span>Store reacted {message.admin_reaction}</span>
          )}
        </footer>
      )}
    </article>
  )
}
