import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button.tsx'
import { Dialog } from '../../../components/ui/Dialog.tsx'
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../../components/ui/Feedback.tsx'
import { Input } from '../../../components/ui/FormControls.tsx'
import { listAddressBookEntries } from '../api/admin-address-book.ts'
import { addressBookQueryKey, filterAddressBookEntries } from '../model.ts'
import type { AddressBookEntry } from '../types.ts'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}

export function AddressBookPicker({
  onSelect,
}: {
  onSelect: (entry: AddressBookEntry) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const entries = useQuery({
    queryKey: addressBookQueryKey,
    queryFn: listAddressBookEntries,
    staleTime: 60_000,
    enabled: open,
  })
  const shown = useMemo(
    () => filterAddressBookEntries(entries.data ?? [], search, 'ACTIVE'),
    [entries.data, search],
  )

  return (
    <>
      <Button
        icon="book-user"
        onClick={() => setOpen(true)}
        type="button"
        variant="secondary"
      >
        Use saved address
      </Button>
      <Dialog
        description="Choose an active entry. Its name and address will be copied into this order and remain editable."
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setSearch('')
        }}
        open={open}
        title="Select from Address Book"
      >
        <div className="address-picker">
          <label className="orders-search">
            <span>Search customer or address</span>
            <Input
              autoFocus
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Type a name or street"
              type="search"
              value={search}
            />
          </label>
          {entries.isPending ? (
            <div
              className="address-picker__list"
              aria-label="Loading addresses"
            >
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton className="address-picker__skeleton" key={index} />
              ))}
            </div>
          ) : entries.isError ? (
            <ErrorState
              description={messageOf(entries.error)}
              onRetry={() => void entries.refetch()}
            />
          ) : shown.length ? (
            <div className="address-picker__list">
              {shown.map((entry) => (
                <button
                  className="address-picker__entry"
                  key={entry.id}
                  onClick={() => {
                    onSelect(entry)
                    setOpen(false)
                    setSearch('')
                  }}
                  type="button"
                >
                  <strong>{entry.customerName}</strong>
                  <span>{entry.exactAddress}</span>
                  <small>Use this address</small>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              description={
                search
                  ? 'Try a different customer name or address.'
                  : 'Add an active entry in Address Book first.'
              }
              icon="book-user"
              title={
                search
                  ? 'No matching saved addresses'
                  : 'No saved addresses yet'
              }
            />
          )}
        </div>
      </Dialog>
    </>
  )
}
