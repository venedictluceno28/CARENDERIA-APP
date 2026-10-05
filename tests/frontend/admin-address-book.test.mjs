import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { URL } from 'node:url'
import {
  addressBookDraftToInput,
  addressBookEntryToDraft,
  addressBookQueryKey,
  filterAddressBookEntries,
} from '../../src/features/admin-address-book/model.ts'
import { savedAddressToManualCustomer } from '../../src/features/admin-manual-order/model.ts'

const entries = [
  {
    id: 'ana-one',
    customerName: 'Ana Santos',
    exactAddress: '12 Mabini Street, Marycris Complex',
    isArchived: false,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
  },
  {
    id: 'ana-two',
    customerName: 'Ana Santos',
    exactAddress: 'Long multiline address\nBlock 4, Wellington Place',
    isArchived: true,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
  },
]

test('uses one stable query identity for the list and Manual Order selector', () => {
  assert.deepEqual(addressBookQueryKey, ['admin-address-book'])
})

test('searches names and exact addresses case-insensitively without uniqueness assumptions', () => {
  assert.equal(filterAddressBookEntries(entries, 'ANA', 'ALL').length, 2)
  assert.deepEqual(
    filterAddressBookEntries(entries, 'wellington', 'ALL').map(
      (entry) => entry.id,
    ),
    ['ana-two'],
  )
  assert.equal(filterAddressBookEntries(entries, 'missing', 'ALL').length, 0)
})

test('active, archived, and all filters preserve the records', () => {
  assert.deepEqual(
    filterAddressBookEntries(entries, '', 'ACTIVE').map((entry) => entry.id),
    ['ana-one'],
  )
  assert.deepEqual(
    filterAddressBookEntries(entries, '', 'ARCHIVED').map((entry) => entry.id),
    ['ana-two'],
  )
  assert.equal(filterAddressBookEntries(entries, '', 'ALL').length, 2)
})

test('create and edit inputs trim Unicode-friendly names and multiline addresses', () => {
  assert.deepEqual(
    addressBookDraftToInput('new-id', {
      customerName: '  María O’Neil-Santos  ',
      exactAddress: '  Unit 2\nMahabang Kalye  ',
    }),
    {
      id: 'new-id',
      customerName: 'María O’Neil-Santos',
      exactAddress: 'Unit 2\nMahabang Kalye',
    },
  )
  assert.deepEqual(addressBookEntryToDraft(entries[0]), {
    customerName: entries[0].customerName,
    exactAddress: entries[0].exactAddress,
  })
})

test('rejects blank and overlong required values', () => {
  assert.equal(
    addressBookDraftToInput('id', {
      customerName: ' ',
      exactAddress: 'Somewhere',
    }),
    null,
  )
  assert.equal(
    addressBookDraftToInput('id', {
      customerName: 'Customer',
      exactAddress: 'x'.repeat(1001),
    }),
    null,
  )
})

test('Manual Order receives copied values that do not track later entry edits', () => {
  const selected = { ...entries[0] }
  const copied = savedAddressToManualCustomer(selected)
  selected.customerName = 'Updated later'
  selected.exactAddress = 'Different saved address'
  assert.deepEqual(copied, {
    customerName: 'Ana Santos',
    exactAddress: '12 Mabini Street, Marycris Complex',
  })
})

test('dashboard, protected route, Back header, and editable autofill are wired', () => {
  const modules = readFileSync(
    new URL('../../src/features/admin-auth/admin-modules.ts', import.meta.url),
    'utf8',
  )
  const app = readFileSync(
    new URL('../../src/app/App.tsx', import.meta.url),
    'utf8',
  )
  const page = readFileSync(
    new URL(
      '../../src/features/admin-address-book/components/AdminAddressBookPage.tsx',
      import.meta.url,
    ),
    'utf8',
  )
  const manual = readFileSync(
    new URL(
      '../../src/features/admin-manual-order/components/AdminManualOrderPage.tsx',
      import.meta.url,
    ),
    'utf8',
  )
  assert.match(
    modules,
    /title: 'ADDRESS BOOK'[\s\S]*enabled: true[\s\S]*\/admin\/address-book/u,
  )
  assert.match(app, /path="\/admin\/address-book"[\s\S]*<AdminRouteGuard>/u)
  assert.match(page, /<AdminPageHeader[\s\S]*subtitle="ADDRESS BOOK"/u)
  assert.match(
    manual,
    /<AddressBookPicker[\s\S]*form\.setValue\('customerName'/u,
  )
  assert.match(manual, /form\.setValue\('exactAddress'/u)
})
