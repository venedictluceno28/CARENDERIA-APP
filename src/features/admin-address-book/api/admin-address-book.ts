import { AppError } from '../../../lib/api/errors.ts'
import { getSupabaseClient } from '../../../lib/supabase/client.ts'
import type { AddressBookEntry, AddressBookInput } from '../types.ts'

type AddressBookRow = {
  id: string
  customer_name: string
  exact_address: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

const columns =
  'id,customer_name,exact_address,is_archived,created_at,updated_at'

function mapRow(row: AddressBookRow): AddressBookEntry {
  return {
    id: row.id,
    customerName: row.customer_name,
    exactAddress: row.exact_address,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function safeAddressBookError(message: string, fallback: string) {
  return new AppError(
    message.includes('ADMIN_REQUIRED') ? 'ADMIN_REQUIRED' : 'UNKNOWN_ERROR',
    message.includes('ADMIN_REQUIRED')
      ? 'Active administrator access is required.'
      : fallback,
  )
}

export async function listAddressBookEntries(): Promise<AddressBookEntry[]> {
  const { data, error } = await getSupabaseClient()
    .from('address_book_entries')
    .select(columns)
    .order('customer_name', { ascending: true })
    .order('exact_address', { ascending: true })
  if (error)
    throw safeAddressBookError(
      error.message,
      'Saved addresses could not be loaded.',
    )
  return ((data ?? []) as AddressBookRow[]).map(mapRow)
}

export async function createAddressBookEntry(
  input: AddressBookInput,
  createdBy: string,
) {
  const { data, error } = await getSupabaseClient()
    .from('address_book_entries')
    .insert({
      id: input.id,
      customer_name: input.customerName,
      exact_address: input.exactAddress,
      created_by: createdBy,
    })
    .select(columns)
    .single()
  if (error)
    throw safeAddressBookError(error.message, 'The address could not be added.')
  return mapRow(data as AddressBookRow)
}

export async function updateAddressBookEntry(input: AddressBookInput) {
  const { data, error } = await getSupabaseClient()
    .from('address_book_entries')
    .update({
      customer_name: input.customerName,
      exact_address: input.exactAddress,
    })
    .eq('id', input.id)
    .select(columns)
    .single()
  if (error)
    throw safeAddressBookError(error.message, 'The address could not be saved.')
  return mapRow(data as AddressBookRow)
}

export async function setAddressBookEntryArchived(
  id: string,
  archived: boolean,
) {
  const { data, error } = await getSupabaseClient()
    .from('address_book_entries')
    .update({ is_archived: archived })
    .eq('id', id)
    .select(columns)
    .single()
  if (error)
    throw safeAddressBookError(
      error.message,
      archived
        ? 'The address could not be archived.'
        : 'The address could not be restored.',
    )
  return mapRow(data as AddressBookRow)
}
