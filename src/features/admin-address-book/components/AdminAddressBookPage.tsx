import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  Skeleton,
} from '../../../components/ui/Feedback.tsx'
import { Field, Input, Textarea } from '../../../components/ui/FormControls.tsx'
import { Icon } from '../../../components/ui/Icon.tsx'
import { createSecureUuid } from '../../../lib/secure-random-uuid.ts'
import { useAdminSession } from '../../admin-auth/index.ts'
import {
  createAddressBookEntry,
  listAddressBookEntries,
  setAddressBookEntryArchived,
  updateAddressBookEntry,
} from '../api/admin-address-book.ts'
import {
  addressBookDraftToInput,
  addressBookEntryToDraft,
  addressBookQueryKey,
  filterAddressBookEntries,
} from '../model.ts'
import type {
  AddressBookDraft,
  AddressBookEntry,
  AddressBookFilter,
} from '../types.ts'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}

export function AdminAddressBookPage() {
  const queryClient = useQueryClient()
  const { session, signOut } = useAdminSession()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AddressBookFilter>('ACTIVE')
  const [editingEntry, setEditingEntry] = useState<AddressBookEntry | null>()
  const [archiveEntry, setArchiveEntry] = useState<AddressBookEntry | null>(
    null,
  )
  const [formDirty, setFormDirty] = useState(false)
  const [notice, setNotice] = useState<string>()
  const addressBook = useQuery({
    queryKey: addressBookQueryKey,
    queryFn: listAddressBookEntries,
    staleTime: 60_000,
  })
  const entries = useMemo(
    () => filterAddressBookEntries(addressBook.data ?? [], search, filter),
    [addressBook.data, filter, search],
  )
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setAddressBookEntryArchived(id, archived),
    onSuccess: async (entry) => {
      setArchiveEntry(null)
      setNotice(
        entry.isArchived
          ? `${entry.customerName} was archived. Existing orders are unchanged.`
          : `${entry.customerName} was restored to active addresses.`,
      )
      await queryClient.invalidateQueries({ queryKey: addressBookQueryKey })
    },
  })

  function closeForm() {
    if (formDirty && !window.confirm('Discard your unsaved address changes?'))
      return
    setEditingEntry(undefined)
    setFormDirty(false)
  }

  const emptyTitle =
    filter === 'ARCHIVED'
      ? 'No archived addresses'
      : search
        ? 'No matching saved addresses'
        : 'No saved addresses yet'

  return (
    <AppBackground className="admin-background address-book-background">
      <AdminPageHeader onLogout={signOut} subtitle="ADDRESS BOOK" />
      <main>
        <PageContainer className="address-book-shell">
          <header className="address-book-heading">
            <div>
              <p className="eyebrow">Reusable customer details</p>
              <h1>ADDRESS BOOK</h1>
              <p>
                Save frequently used names and exact addresses for faster Manual
                Orders. Past orders keep their own copied details.
              </p>
            </div>
            <Button
              icon="plus"
              onClick={() => {
                setNotice(undefined)
                setEditingEntry(null)
              }}
              size="large"
            >
              Add address
            </Button>
          </header>

          {notice && (
            <p className="action-notice" role="status">
              <Icon name="check" /> {notice}
            </p>
          )}

          <section
            className="address-book-controls"
            aria-label="Address filters"
          >
            <label className="orders-search">
              <span>Search customer or exact address</span>
              <Input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Type a name or street"
                type="search"
                value={search}
              />
            </label>
            <div>
              <span className="address-book-filter-label">Status</span>
              <div className="address-book-filter-buttons">
                {(['ACTIVE', 'ARCHIVED', 'ALL'] as const).map((value) => (
                  <button
                    aria-pressed={filter === value}
                    key={value}
                    onClick={() => setFilter(value)}
                    type="button"
                  >
                    {value === 'ACTIVE'
                      ? 'Active'
                      : value === 'ARCHIVED'
                        ? 'Archived'
                        : 'All'}
                  </button>
                ))}
              </div>
            </div>
            <Button
              loading={addressBook.isFetching}
              onClick={() => void addressBook.refetch()}
              variant="secondary"
            >
              Refresh
            </Button>
          </section>

          {addressBook.isPending ? (
            <div className="address-book-list" aria-label="Loading addresses">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton className="address-book-skeleton" key={index} />
              ))}
            </div>
          ) : addressBook.isError ? (
            <ErrorState
              description={messageOf(addressBook.error)}
              onRetry={() => void addressBook.refetch()}
            />
          ) : entries.length ? (
            <div className="address-book-list">
              {entries.map((entry) => (
                <AddressBookCard
                  entry={entry}
                  key={entry.id}
                  onArchive={() => setArchiveEntry(entry)}
                  onEdit={() => {
                    setNotice(undefined)
                    setEditingEntry(entry)
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              action={
                filter !== 'ARCHIVED' && !search ? (
                  <Button onClick={() => setEditingEntry(null)}>
                    Add address
                  </Button>
                ) : undefined
              }
              description={
                filter === 'ARCHIVED'
                  ? 'Archived address entries will appear here.'
                  : search
                    ? 'Try a different customer name or address.'
                    : 'Add the first reusable customer address.'
              }
              icon="book-user"
              title={emptyTitle}
            />
          )}
        </PageContainer>
      </main>

      <Dialog
        description="Names and exact addresses are private admin convenience data."
        onOpenChange={(open) => !open && closeForm()}
        open={editingEntry !== undefined}
        title={
          editingEntry ? `Edit ${editingEntry.customerName}` : 'Add address'
        }
      >
        {editingEntry !== undefined && session && (
          <AddressBookForm
            createdBy={session.user.id}
            entry={editingEntry}
            key={editingEntry?.id ?? 'new'}
            onCancel={closeForm}
            onDirtyChange={setFormDirty}
            onSaved={async (entry) => {
              setEditingEntry(undefined)
              setFormDirty(false)
              setNotice(
                editingEntry
                  ? `${entry.customerName} was updated successfully.`
                  : `${entry.customerName} was added to Address Book.`,
              )
              await queryClient.invalidateQueries({
                queryKey: addressBookQueryKey,
              })
            }}
          />
        )}
      </Dialog>

      <Dialog
        description={
          archiveEntry?.isArchived
            ? 'It will be available for Manual Order selection again.'
            : 'It will be hidden from normal selection. Existing orders and their copied addresses are unchanged.'
        }
        onOpenChange={(open) => !open && setArchiveEntry(null)}
        open={Boolean(archiveEntry)}
        title={
          archiveEntry?.isArchived
            ? 'Restore this address?'
            : 'Archive this address?'
        }
      >
        {archiveMutation.isError && (
          <p className="form-error" role="alert">
            {messageOf(archiveMutation.error)}
          </p>
        )}
        <div className="address-book-confirm-actions">
          <Button onClick={() => setArchiveEntry(null)} variant="ghost">
            Go back
          </Button>
          <Button
            loading={archiveMutation.isPending}
            onClick={() =>
              archiveEntry &&
              archiveMutation.mutate({
                id: archiveEntry.id,
                archived: !archiveEntry.isArchived,
              })
            }
            variant={archiveEntry?.isArchived ? 'primary' : 'destructive'}
          >
            {archiveEntry?.isArchived ? 'Restore' : 'Archive'}
          </Button>
        </div>
      </Dialog>
    </AppBackground>
  )
}

function AddressBookCard({
  entry,
  onArchive,
  onEdit,
}: {
  entry: AddressBookEntry
  onArchive: () => void
  onEdit: () => void
}) {
  return (
    <article
      className={`address-book-card${entry.isArchived ? ' address-book-card--archived' : ''}`}
    >
      <button
        className="address-book-card__main"
        onClick={onEdit}
        type="button"
      >
        <span className="address-book-card__heading">
          <Icon name="user" />
          <strong>{entry.customerName}</strong>
          {entry.isArchived && <Badge variant="cancelled">Archived</Badge>}
        </span>
        <span className="address-book-card__address">{entry.exactAddress}</span>
        <small>Edit customer and exact address</small>
      </button>
      <div className="address-book-card__actions">
        <Button onClick={onEdit} variant="secondary">
          Edit
        </Button>
        <Button
          onClick={onArchive}
          variant={entry.isArchived ? 'secondary' : 'ghost'}
        >
          {entry.isArchived ? 'Restore' : 'Archive'}
        </Button>
      </div>
    </article>
  )
}

function AddressBookForm({
  createdBy,
  entry,
  onCancel,
  onDirtyChange,
  onSaved,
}: {
  createdBy: string
  entry: AddressBookEntry | null
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
  onSaved: (entry: AddressBookEntry) => Promise<void>
}) {
  const entryId = useRef(entry?.id ?? createSecureUuid()).current
  const form = useForm<AddressBookDraft>({
    defaultValues: entry
      ? addressBookEntryToDraft(entry)
      : { customerName: '', exactAddress: '' },
  })
  useEffect(
    () => onDirtyChange(form.formState.isDirty),
    [form.formState.isDirty, onDirtyChange],
  )
  const saveMutation = useMutation({
    mutationFn: (draft: AddressBookDraft) => {
      const input = addressBookDraftToInput(entryId, draft)
      if (!input) throw new Error('Check the customer name and exact address.')
      return entry
        ? updateAddressBookEntry(input)
        : createAddressBookEntry(input, createdBy)
    },
    onSuccess: onSaved,
  })

  return (
    <form
      className="address-book-form"
      onSubmit={form.handleSubmit((draft) => saveMutation.mutate(draft))}
    >
      <Field
        error={form.formState.errors.customerName?.message}
        htmlFor="address-book-customer-name"
        label="Customer name"
        required
      >
        <Input
          autoComplete="name"
          id="address-book-customer-name"
          maxLength={160}
          {...form.register('customerName', {
            required: 'Enter the customer name.',
            maxLength: { value: 160, message: 'Use 160 characters or fewer.' },
            validate: (value) =>
              value.trim().length > 0 || 'Enter the customer name.',
          })}
        />
      </Field>
      <Field
        description="Include house or block details, street, subdivision, and useful landmarks."
        error={form.formState.errors.exactAddress?.message}
        htmlFor="address-book-exact-address"
        label="Exact address"
        required
      >
        <Textarea
          autoComplete="street-address"
          id="address-book-exact-address"
          maxLength={1000}
          rows={5}
          {...form.register('exactAddress', {
            required: 'Enter the exact address.',
            maxLength: {
              value: 1000,
              message: 'Use 1,000 characters or fewer.',
            },
            validate: (value) =>
              value.trim().length > 0 || 'Enter the exact address.',
          })}
        />
      </Field>
      {saveMutation.isError && (
        <p className="form-error" role="alert">
          {messageOf(saveMutation.error)}
        </p>
      )}
      <div className="address-book-form__actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          Discard
        </Button>
        <Button loading={saveMutation.isPending} type="submit">
          Save address
        </Button>
      </div>
    </form>
  )
}
