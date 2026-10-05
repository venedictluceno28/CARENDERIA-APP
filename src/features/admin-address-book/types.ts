export type AddressBookFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL'

export type AddressBookEntry = {
  id: string
  customerName: string
  exactAddress: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export type AddressBookDraft = {
  customerName: string
  exactAddress: string
}

export type AddressBookInput = AddressBookDraft & {
  id: string
}
