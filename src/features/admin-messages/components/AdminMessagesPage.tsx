import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AdminPageHeader } from '../../../components/layout/AdminPageHeader.tsx'
import {
  AppBackground,
  PageContainer,
} from '../../../components/layout/Page.tsx'
import { Badge } from '../../../components/ui/Badge.tsx'
import { Button } from '../../../components/ui/Button.tsx'
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../../components/ui/Feedback.tsx'
import { Input } from '../../../components/ui/FormControls.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { useAuthoritativeRealtime } from '../../../lib/realtime/use-authoritative-realtime.ts'
import { useAdminSession } from '../../admin-auth/index.ts'
import { listAdminConversations } from '../api/admin-messages.ts'
import {
  adminMessageQueryKeys,
  isGuestChatActive,
  mergeConversationPages,
} from '../model.ts'
import type {
  AdminConversationFilter,
  AdminConversationSummary,
} from '../types.ts'

const FILTERS: Array<{ value: AdminConversationFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'ONLINE_PAYMENT', label: 'Online payment' },
  { value: 'NOT_VERIFIED', label: 'Not Verified' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'ACTIVE_GUEST', label: 'Chat active' },
  { value: 'EXPIRED_GUEST', label: 'Chat expired' },
]

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AdminMessagesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { signOut } = useAdminSession()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [filter, setFilter] = useState<AdminConversationFilter>('ALL')
  const conversations = useInfiniteQuery({
    queryKey: adminMessageQueryKeys.conversations(deferredSearch, filter),
    queryFn: ({ pageParam }) =>
      listAdminConversations({
        search: deferredSearch,
        filter,
        before: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_before ?? undefined,
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
  const refreshInbox = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: adminMessageQueryKeys.all })
  }, [queryClient])

  useAuthoritativeRealtime({
    topic: 'admin-messages',
    privateChannel: true,
    onSignal: refreshInbox,
  })
  const shown = useMemo(
    () => mergeConversationPages(conversations.data?.pages ?? []),
    [conversations.data?.pages],
  )
  const emptyTitle = deferredSearch
    ? 'No matching conversations'
    : filter === 'ALL'
      ? 'No messages yet'
      : 'No conversations in this filter'

  return (
    <AppBackground className="admin-background admin-messages-background">
      <AdminPageHeader onLogout={signOut} subtitle="MESSAGE" />
      <main>
        <PageContainer className="admin-messages-shell">
          <header className="messages-page-heading">
            <div>
              <p className="eyebrow">Order-linked inbox</p>
              <h1>MESSAGE</h1>
              <p>
                Read customer conversations, inspect payment receipts, and reply
                without exposing private order access.
              </p>
            </div>
            <Button
              loading={conversations.isFetching}
              onClick={() => void conversations.refetch()}
              variant="secondary"
            >
              Refresh
            </Button>
          </header>

          <section
            className="message-inbox-controls"
            aria-label="Inbox filters"
          >
            <label className="orders-search">
              <span>Search customer or order code</span>
              <Input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="e.g. Maria or CRD-1042"
                type="search"
                value={search}
              />
            </label>
            <div>
              <span className="message-filter-label">Show</span>
              <div className="message-filter-buttons">
                {FILTERS.map((option) => (
                  <button
                    aria-pressed={filter === option.value}
                    key={option.value}
                    onClick={() => setFilter(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {conversations.isPending ? (
            <div
              className="conversation-list"
              aria-label="Loading conversations"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton className="conversation-card-skeleton" key={index} />
              ))}
            </div>
          ) : conversations.isError ? (
            <ErrorState
              description={messageOf(conversations.error)}
              onRetry={() => void conversations.refetch()}
              title="Unable to load messages"
            />
          ) : shown.length ? (
            <>
              <div className="conversation-list">
                {shown.map((conversation) => (
                  <ConversationCard
                    conversation={conversation}
                    key={conversation.conversation_id}
                    onOpen={() =>
                      navigate(`/admin/messages/${conversation.order_id}`)
                    }
                  />
                ))}
              </div>
              {conversations.hasNextPage && (
                <Button
                  className="messages-load-more"
                  loading={conversations.isFetchingNextPage}
                  onClick={() => void conversations.fetchNextPage()}
                  variant="secondary"
                >
                  Load more
                </Button>
              )}
            </>
          ) : (
            <EmptyState
              description={
                deferredSearch
                  ? 'Try another customer name or order code.'
                  : filter === 'ALL'
                    ? 'Customer conversations will appear after messaging activity.'
                    : 'Choose another filter or refresh the inbox.'
              }
              icon="message"
              title={emptyTitle}
            />
          )}
        </PageContainer>
      </main>
    </AppBackground>
  )
}

function ConversationCard({
  conversation,
  onOpen,
}: {
  conversation: AdminConversationSummary
  onOpen: () => void
}) {
  const active = isGuestChatActive(conversation.guest_chat_expires_at)
  return (
    <button className="conversation-card" onClick={onOpen} type="button">
      <span className="conversation-card__topline">
        <strong>{conversation.customer_name}</strong>
        <time dateTime={conversation.last_message_at}>
          {dateTimeLabel(conversation.last_message_at)}
        </time>
      </span>
      <span className="conversation-card__order">
        <Icon name="receipt" /> {conversation.order_code}
      </span>
      <span className="conversation-card__preview">
        <b>
          {conversation.last_sender_type === 'GUEST' ? 'Customer' : 'Store'}:
        </b>{' '}
        {conversation.last_message_preview}
      </span>
      <span className="conversation-card__badges">
        <Badge variant="info">
          {conversation.payment_method === 'CASH' ? 'Cash' : 'Online Payment'}
        </Badge>
        {conversation.payment_method === 'ONLINE_PAYMENT' && (
          <Badge
            variant={
              conversation.payment_verification_state === 'VERIFIED'
                ? 'verified'
                : 'unverified'
            }
          >
            {conversation.payment_verification_state === 'VERIFIED'
              ? 'Verified'
              : 'Not Verified'}
          </Badge>
        )}
        <Badge variant={active ? 'available' : 'cancelled'}>
          Customer chat {active ? 'active' : 'expired'}
        </Badge>
      </span>
      <span className="conversation-card__open">
        Open conversation <Icon name="arrow-right" />
      </span>
    </button>
  )
}
