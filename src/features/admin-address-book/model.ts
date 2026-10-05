import type {
  AddressBookDraft,
  AddressBookEntry,
  AddressBookFilter,
  AddressBookInput,
} from './types.ts'

export const addressBookQueryKey = ['admin-address-book'] as const

export function addressBookEntryToDraft(
  entry: AddressBookEntry,
): AddressBookDraft {
  return {
    customerName: entry.customerName,
    exactAddress: entry.exactAddress,
  }
}

export function addressBookDraftToInput(
  id: string,
  draft: AddressBookDraft,
): AddressBookInput | null {
  const customerName = draft.customerName.trim()
  const exactAddress = draft.exactAddress.trim()
  if (
    !customerName ||
    customerName.length > 160 ||
    !exactAddress ||
    exactAddress.length > 1000
  )
    return null
  return { id, customerName, exactAddress }
}

export function filterAddressBookEntries(
  entries: AddressBookEntry[],
  search: string,
  filter: AddressBookFilter,
) {
  const needle = search.trim().toLocaleLowerCase()
  return entries.filter((entry) => {
    const matchesFilter =
      filter === 'ALL' ||
      (filter === 'ARCHIVED' ? entry.isArchived : !entry.isArchived)
    const matchesSearch =
      !needle ||
      entry.customerName.toLocaleLowerCase().includes(needle) ||
      entry.exactAddress.toLocaleLowerCase().includes(needle)
    return matchesFilter && matchesSearch
  })
}
