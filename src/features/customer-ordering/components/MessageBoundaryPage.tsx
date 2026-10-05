import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../../../components/layout/AppHeader'
import { AppBackground, PageContainer } from '../../../components/layout/Page'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from '../../../components/ui/Feedback'
import { Icon } from '../../../components/ui/Icon'
import { GlassSurface } from '../../../components/ui/Surface'
import {
  getGuestAttachmentSignedUrl,
  getGuestReceipt,
  listGuestMessages,
  reactToGuestMessage,
  sendGuestMessage,
  uploadGuestImage,
  type GuestMessage,
  type GuestMessageAttachment,
  type GuestReceipt,
} from '../../../lib/api/guest-access'
import { AppError } from '../../../lib/api/errors'
import {
  getGuestOrderSessionStatus,
  type GuestOrderSession,
} from '../../../lib/guest-session'
import { useAuthoritativeRealtime } from '../../../lib/realtime/use-authoritative-realtime'
import { guestConversationTopic } from '../../../lib/realtime/realtime-topics'
import {
  ACCEPTED_IMAGE_TYPES,
  canSubmitMessage,
  GUEST_REACTIONS,
  guestPaymentStatus,
  MAX_MESSAGE_LENGTH,
  mergeMessagePages,
  messagingErrorMessage,
  nextGuestReaction,
  showsPaymentEvidenceAction,
  validateSelectedImage,
} from '../messaging/messaging-model'

type AttachmentPurpose = 'CHAT_IMAGE' | 'PAYMENT_EVIDENCE'

export function MessageBoundaryPage() {
  const { orderCode = '' } = useParams()
  const navigate = useNavigate()
  const sessionStatus = getGuestOrderSessionStatus(orderCode)

  if (sessionStatus.status !== 'valid') {
    return (
      <MessagingAccessState
        expired={sessionStatus.status === 'expired'}
        onBack={() => navigate(`/order/receipt/${orderCode}`)}
        orderCode={orderCode}
      />
    )
  }

  return <MessagingExperience identity={sessionStatus.session} />
}

function MessagingExperience({ identity }: { identity: GuestOrderSession }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const bottomMarker = useRef<HTMLDivElement>(null)
  const messageLog = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const initializedScroll = useRef(false)
  const forceLatest = useRef(false)
  const previousLastMessage = useRef<string | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [attachmentPurpose, setAttachmentPurpose] =
    useState<AttachmentPurpose>('CHAT_IMAGE')
  const [composerError, setComposerError] = useState<string | null>(null)
  const [accessRevoked, setAccessRevoked] = useState(false)
  const [hasNewMessage, setHasNewMessage] = useState(false)

  const receiptQuery = useQuery({
    queryKey: ['guest', 'receipt', identity.orderCode],
    queryFn: () => getGuestReceipt(identity),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })
  const messagesQuery = useInfiniteQuery({
    queryKey: ['guest', 'messages', identity.orderCode],
    queryFn: ({ pageParam }) =>
      listGuestMessages(identity, { before: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.messages.length === 50
        ? lastPage.messages[0]?.created_at
        : undefined,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
  const messages = useMemo(
    () => mergeMessagePages(messagesQuery.data?.pages ?? []),
    [messagesQuery.data?.pages],
  )
  const conversationExpiry =
    messagesQuery.data?.pages[0]?.expires_at ?? identity.expiresAt
  const conversationId = messagesQuery.data?.pages[0]?.conversation_id
  const refreshConversation = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['guest', 'messages', identity.orderCode],
      }),
      queryClient.invalidateQueries({
        queryKey: ['guest', 'receipt', identity.orderCode],
      }),
    ])
  }, [identity.orderCode, queryClient])

  useAuthoritativeRealtime({
    topic: conversationId ? guestConversationTopic(conversationId) : undefined,
    onSignal: refreshConversation,
  })

  const lastMessageId = messages.at(-1)?.id

  useEffect(() => {
    const log = messageLog.current
    if (!log || !messages.length) return
    const latestChanged =
      Boolean(previousLastMessage.current) &&
      previousLastMessage.current !== lastMessageId
    if (
      !initializedScroll.current ||
      nearBottom.current ||
      forceLatest.current
    ) {
      log.scrollTop = log.scrollHeight
      initializedScroll.current = true
      forceLatest.current = false
      setHasNewMessage(false)
    } else if (latestChanged) {
      setHasNewMessage(true)
    }
    previousLastMessage.current = lastMessageId
  }, [lastMessageId, messages.length])

  const sendMutation = useMutation({
    mutationFn: async () => {
      const text = draft.trim()
      if (!canSubmitMessage(text, Boolean(selectedFile)))
        throw new AppError('INVALID_MESSAGE', 'Message is invalid.')
      if (selectedFile) {
        return uploadGuestImage(
          identity,
          selectedFile,
          attachmentPurpose,
          text || undefined,
        )
      }
      return sendGuestMessage(identity, text)
    },
    onSuccess: async () => {
      setDraft('')
      clearSelectedFile()
      setComposerError(null)
      forceLatest.current = true
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['guest', 'messages', identity.orderCode],
        }),
        queryClient.invalidateQueries({
          queryKey: ['guest', 'receipt', identity.orderCode],
        }),
      ])
    },
    onError: (error) => {
      if (isGuestAccessError(error)) setAccessRevoked(true)
      setComposerError(messagingErrorMessage(error))
    },
  })

  const reactionMutation = useMutation({
    mutationFn: ({
      messageId,
      reaction,
    }: {
      messageId: string
      reaction: string | null
    }) => reactToGuestMessage(identity, messageId, reaction),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['guest', 'messages', identity.orderCode],
      }),
    onError: (error) => {
      if (isGuestAccessError(error)) setAccessRevoked(true)
    },
  })

  function chooseImage(purpose: AttachmentPurpose) {
    setAttachmentPurpose(purpose)
    setComposerError(null)
    if (fileInput.current) {
      fileInput.current.value = ''
      fileInput.current.click()
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const error = validateSelectedImage(file)
    if (error) {
      setSelectedFile(null)
      setComposerError(error)
      return
    }
    setSelectedFile(file)
    setComposerError(null)
  }

  function clearSelectedFile() {
    setSelectedFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const accessError =
    accessRevoked ||
    isGuestAccessError(receiptQuery.error) ||
    isGuestAccessError(messagesQuery.error)
  if (accessError) {
    return (
      <MessagingAccessState
        expired
        onBack={() => navigate(`/order/receipt/${identity.orderCode}`)}
        orderCode={identity.orderCode}
      />
    )
  }

  return (
    <AppBackground className="messages-page">
      <AppHeader
        subtitle="Secure order messages"
        actions={
          <Button
            onClick={() => navigate(`/order/receipt/${identity.orderCode}`)}
            variant="glass"
          >
            Receipt
          </Button>
        }
      />
      <main>
        <PageContainer className="messages-shell">
          <ConversationHeader
            expiresAt={conversationExpiry}
            orderCode={identity.orderCode}
            receipt={receiptQuery.data}
          />

          <GlassSurface className="conversation" variant="strong">
            <div className="conversation__heading">
              <div>
                <p className="eyebrow">Conversation</p>
                <h1>Messages with the store</h1>
              </div>
              <Button
                aria-label="Refresh messages"
                loading={messagesQuery.isRefetching}
                onClick={() => void messagesQuery.refetch()}
                variant="secondary"
              >
                Refresh
              </Button>
            </div>

            <div
              aria-busy={messagesQuery.isPending}
              aria-label="Order message history"
              className="message-list"
              onScroll={(event) => {
                const target = event.currentTarget
                nearBottom.current =
                  target.scrollHeight - target.scrollTop - target.clientHeight <
                  120
                if (nearBottom.current) setHasNewMessage(false)
              }}
              ref={messageLog}
              role="log"
            >
              {messagesQuery.isPending ? (
                <MessageListLoading />
              ) : messagesQuery.isError ? (
                <ErrorState
                  description={messagingErrorMessage(messagesQuery.error)}
                  onRetry={() => void messagesQuery.refetch()}
                  title="We couldn’t load the messages"
                />
              ) : messages.length ? (
                <>
                  {messagesQuery.hasNextPage && (
                    <Button
                      loading={messagesQuery.isFetchingNextPage}
                      onClick={() => void messagesQuery.fetchNextPage()}
                      variant="ghost"
                    >
                      Load earlier messages
                    </Button>
                  )}
                  <ol className="message-list__items">
                    {messages.map((message) => (
                      <MessageBubble
                        identity={identity}
                        key={message.id}
                        message={message}
                        onReact={(reaction) =>
                          reactionMutation.mutate({
                            messageId: message.id,
                            reaction,
                          })
                        }
                        reacting={
                          reactionMutation.isPending &&
                          reactionMutation.variables?.messageId === message.id
                        }
                      />
                    ))}
                  </ol>
                  <div aria-hidden="true" ref={bottomMarker} />
                </>
              ) : (
                <EmptyState
                  description="Send a message or photo about this order. The store’s replies will appear here."
                  icon="message"
                  title="No messages yet"
                />
              )}
            </div>
            {hasNewMessage && (
              <Button
                className="jump-to-latest"
                onClick={() => {
                  forceLatest.current = true
                  setHasNewMessage(false)
                  const log = messageLog.current
                  if (log) log.scrollTop = log.scrollHeight
                }}
                type="button"
                variant="secondary"
              >
                New message ↓
              </Button>
            )}

            <form
              className="message-composer"
              onSubmit={(event) => {
                event.preventDefault()
                setComposerError(null)
                sendMutation.mutate()
              }}
            >
              <label className="label" htmlFor="message-draft">
                Message
              </label>
              <textarea
                aria-describedby="message-limit message-error"
                className="input textarea message-composer__input"
                disabled={sendMutation.isPending}
                id="message-draft"
                maxLength={MAX_MESSAGE_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type a message to the store…"
                rows={3}
                value={draft}
              />
              <div className="message-composer__meta" id="message-limit">
                <span>Plain text only</span>
                <span>
                  {draft.length}/{MAX_MESSAGE_LENGTH}
                </span>
              </div>
              <input
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                className="sr-only"
                onChange={handleFile}
                ref={fileInput}
                type="file"
              />
              {selectedFile && (
                <SelectedImagePreview
                  file={selectedFile}
                  onRemove={clearSelectedFile}
                  purpose={attachmentPurpose}
                />
              )}
              {composerError && (
                <p className="field__error" id="message-error" role="alert">
                  {composerError}
                </p>
              )}
              <div className="message-composer__actions">
                <Button
                  aria-label="Attach a photo"
                  disabled={sendMutation.isPending}
                  icon="image"
                  onClick={() => chooseImage('CHAT_IMAGE')}
                  type="button"
                  variant="secondary"
                >
                  Photo
                </Button>
                {receiptQuery.data &&
                  showsPaymentEvidenceAction(receiptQuery.data) && (
                    <Button
                      aria-label="Send a payment receipt image"
                      disabled={sendMutation.isPending}
                      icon="receipt"
                      onClick={() => chooseImage('PAYMENT_EVIDENCE')}
                      type="button"
                      variant="secondary"
                    >
                      Payment receipt
                    </Button>
                  )}
                <Button
                  disabled={!canSubmitMessage(draft, Boolean(selectedFile))}
                  loading={sendMutation.isPending}
                  type="submit"
                >
                  Send
                </Button>
              </div>
              {receiptQuery.data?.payment_method === 'ONLINE_PAYMENT' && (
                <p className="message-composer__evidence-note">
                  <Icon name="lock" /> Send a screenshot or photo of your
                  payment receipt. The admin will review it manually; uploading
                  does not verify payment automatically.
                </p>
              )}
            </form>
          </GlassSurface>
        </PageContainer>
      </main>
    </AppBackground>
  )
}

function ConversationHeader({
  orderCode,
  receipt,
  expiresAt,
}: {
  orderCode: string
  receipt?: GuestReceipt
  expiresAt: string
}) {
  const paymentStatus = receipt ? guestPaymentStatus(receipt) : null
  return (
    <GlassSurface className="conversation-context" variant="strong">
      <div>
        <Badge variant="info">Private order conversation</Badge>
        <p className="eyebrow">Order reference</p>
        <strong className="conversation-context__code">{orderCode}</strong>
      </div>
      <dl>
        {receipt && (
          <div>
            <dt>Payment</dt>
            <dd>
              {receipt.payment_method === 'ONLINE_PAYMENT'
                ? 'Online payment'
                : 'Cash'}
            </dd>
          </div>
        )}
        {paymentStatus && (
          <div>
            <dt>Status</dt>
            <dd>
              <Badge
                variant={
                  paymentStatus === 'Verified' ? 'verified' : 'unverified'
                }
              >
                {paymentStatus}
              </Badge>
            </dd>
          </div>
        )}
        <div>
          <dt>Messaging available until</dt>
          <dd>{formatExpiry(expiresAt)}</dd>
        </div>
      </dl>
      <p>
        Guest messaging is available for 24 hours after ordering. Sending a
        message does not extend this window.
      </p>
    </GlassSurface>
  )
}

function MessageBubble({
  identity,
  message,
  onReact,
  reacting,
}: {
  identity: GuestOrderSession
  message: GuestMessage
  onReact: (reaction: string | null) => void
  reacting: boolean
}) {
  const guest = message.sender_type === 'GUEST'
  return (
    <li className={`message-row message-row--${guest ? 'guest' : 'admin'}`}>
      <article className="message-bubble">
        <header>
          <strong>{guest ? 'You' : 'Store admin'}</strong>
          <time dateTime={message.created_at}>
            {formatMessageTime(message.created_at)}
          </time>
        </header>
        {message.text && <p>{message.text}</p>}
        {message.attachments.map((attachment) => (
          <MessageAttachment
            attachment={attachment}
            identity={identity}
            key={attachment.id}
            sender={guest ? 'your' : 'the store’s'}
          />
        ))}
        <div className="message-reactions" aria-label="React to this message">
          {GUEST_REACTIONS.map((reaction) => (
            <button
              aria-label={`${message.guest_reaction === reaction ? 'Remove' : 'Add'} ${reaction} reaction`}
              aria-pressed={message.guest_reaction === reaction}
              disabled={reacting}
              key={reaction}
              onClick={() =>
                onReact(nextGuestReaction(message.guest_reaction, reaction))
              }
              type="button"
            >
              {reaction}
            </button>
          ))}
        </div>
        {(message.guest_reaction || message.admin_reaction) && (
          <div className="message-reaction-summary">
            {message.guest_reaction && (
              <span>You reacted {message.guest_reaction}</span>
            )}
            {message.admin_reaction && (
              <span>Store reacted {message.admin_reaction}</span>
            )}
          </div>
        )}
      </article>
    </li>
  )
}

function MessageAttachment({
  attachment,
  identity,
  sender,
}: {
  attachment: GuestMessageAttachment
  identity: GuestOrderSession
  sender: string
}) {
  if (attachment.purpose === 'PAYMENT_EVIDENCE') {
    return (
      <div className="payment-evidence-card">
        <Icon name="receipt" />
        <div>
          <strong>Payment receipt sent securely</strong>
          <small>Available to the admin for manual review</small>
        </div>
      </div>
    )
  }
  return (
    <SecureMessageImage
      alt={`Private chat image sent by ${sender}`}
      attachmentId={attachment.id}
      identity={identity}
    />
  )
}

function SecureMessageImage({
  attachmentId,
  identity,
  alt,
}: {
  attachmentId: string
  identity: GuestOrderSession
  alt: string
}) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const imageQuery = useQuery({
    queryKey: ['guest', 'attachment', identity.orderCode, attachmentId],
    queryFn: () => getGuestAttachmentSignedUrl(identity, attachmentId),
    staleTime: 45_000,
    gcTime: 60_000,
    refetchInterval: 45_000,
  })
  if (imageQuery.isPending)
    return (
      <Skeleton className="message-attachment message-attachment--loading" />
    )
  if (imageQuery.isError) {
    return (
      <div className="message-attachment-error" role="alert">
        <Icon name="image" />
        <span>{messagingErrorMessage(imageQuery.error)}</span>
        <Button onClick={() => void imageQuery.refetch()} variant="ghost">
          Retry image
        </Button>
      </div>
    )
  }
  return (
    <>
      <button
        aria-label={`Open larger view: ${alt}`}
        className="message-image-button"
        onClick={() => setViewerOpen(true)}
        type="button"
      >
        <img
          alt={alt}
          className="message-attachment"
          src={imageQuery.data.url}
        />
      </button>
      <Dialog
        description="Private order image. The signed view expires shortly."
        onOpenChange={setViewerOpen}
        open={viewerOpen}
        title="Chat photo"
      >
        <img
          alt={alt}
          className="message-image-viewer"
          src={imageQuery.data.url}
        />
      </Dialog>
    </>
  )
}

function SelectedImagePreview({
  file,
  purpose,
  onRemove,
}: {
  file: File
  purpose: AttachmentPurpose
  onRemove: () => void
}) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])
  return (
    <div className="selected-image">
      <img alt="Selected attachment preview" src={previewUrl} />
      <div>
        <Badge variant={purpose === 'PAYMENT_EVIDENCE' ? 'online' : 'info'}>
          {purpose === 'PAYMENT_EVIDENCE' ? 'Payment receipt' : 'Chat photo'}
        </Badge>
        <strong>{file.name}</strong>
        <small>{formatFileSize(file.size)}</small>
      </div>
      <Button
        aria-label="Remove selected image"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Icon name="x" />
      </Button>
    </div>
  )
}

function MessageListLoading() {
  return (
    <div
      aria-label="Loading order messages"
      className="message-list-loading"
      role="status"
    >
      <Skeleton />
      <Skeleton />
      <LoadingState label="Loading secure messages…" />
    </div>
  )
}

function MessagingAccessState({
  expired,
  orderCode,
  onBack,
}: {
  expired: boolean
  orderCode: string
  onBack: () => void
}) {
  return (
    <AppBackground className="messages-page">
      <AppHeader subtitle="Order messages" />
      <main>
        <PageContainer className="messages-shell messages-shell--state">
          <GlassSurface variant="strong">
            <EmptyState
              action={<Button onClick={onBack}>Back to receipt</Button>}
              description={
                expired
                  ? `Guest messaging is available for 24 hours after ordering. Use ${orderCode || 'the order code'} only as a support reference when contacting the store another way.`
                  : 'A valid guest credential for this order was not found in this browser. The order code alone cannot open private messages.'
              }
              icon={expired ? 'clock' : 'lock'}
              title={
                expired
                  ? 'Guest messaging for this order has expired'
                  : 'Messaging unavailable'
              }
            />
          </GlassSurface>
        </PageContainer>
      </main>
    </AppBackground>
  )
}

function isGuestAccessError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    [
      'GUEST_ACCESS_DENIED',
      'GUEST_ACCESS_EXPIRED',
      'AUTHORIZATION_REQUIRED',
    ].includes(error.code)
  )
}

function formatExpiry(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'the end of your guest window'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date)
}

function formatMessageTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(date)
}

function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
