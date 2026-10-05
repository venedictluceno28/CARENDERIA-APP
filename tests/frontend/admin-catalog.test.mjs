import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CATALOG_IMAGE_TYPES,
  MAX_CATALOG_IMAGE_BYTES,
  catalogDraftToInput,
  catalogItemToDraft,
  catalogQueryKey,
  filterCatalogItems,
  validateCatalogImage,
} from '../../src/features/admin-catalog/model.ts'

const items = [
  {
    id: 'adobo',
    name: 'Chicken Adobo',
    category: 'ULAM',
    priceCentavos: 8500,
    internalDfCentavos: 1000,
    photoPath: 'catalog/adobo/photo.jpg',
    isArchived: false,
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:00:00Z',
  },
  {
    id: 'flan',
    name: 'Leche Flan',
    category: 'DESSERTS',
    priceCentavos: 5000,
    internalDfCentavos: 0,
    photoPath: 'catalog/flan/photo.png',
    isArchived: true,
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:00:00Z',
  },
  {
    id: 'rice',
    name: 'Extra Rice',
    category: 'EXTRAS',
    priceCentavos: 1500,
    internalDfCentavos: 200,
    photoPath: 'catalog/rice/photo.webp',
    isArchived: false,
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:00:00Z',
  },
]

test('catalog query has one stable invalidation identity', () => {
  assert.deepEqual(catalogQueryKey, ['admin-catalog'])
})

test('defaults can select active items while archived and all remain available', () => {
  assert.deepEqual(
    filterCatalogItems(items, '', 'ALL', 'ACTIVE').map((item) => item.id),
    ['adobo', 'rice'],
  )
  assert.deepEqual(
    filterCatalogItems(items, '', 'ALL', 'ARCHIVED').map((item) => item.id),
    ['flan'],
  )
  assert.equal(filterCatalogItems(items, '', 'ALL', 'ALL').length, 3)
})

test('search is case-insensitive and composes with category filtering', () => {
  assert.deepEqual(
    filterCatalogItems(items, 'ADObo', 'ULAM', 'ALL').map((item) => item.id),
    ['adobo'],
  )
  assert.deepEqual(
    filterCatalogItems(items, '', 'EXTRAS', 'ACTIVE').map((item) => item.id),
    ['rice'],
  )
})

test('JPEG, PNG, and WebP are accepted within the five MiB limit', () => {
  for (const type of CATALOG_IMAGE_TYPES) {
    assert.equal(validateCatalogImage({ type, size: 1000 }), null)
  }
  assert.equal(
    validateCatalogImage({ type: 'image/jpeg', size: MAX_CATALOG_IMAGE_BYTES }),
    null,
  )
})

test('missing, unsupported, empty, and oversized images are rejected', () => {
  assert.match(validateCatalogImage(null), /Choose/u)
  assert.match(validateCatalogImage({ type: 'image/gif', size: 1000 }), /JPEG/u)
  assert.match(validateCatalogImage({ type: 'image/png', size: 0 }), /empty/u)
  assert.match(
    validateCatalogImage({
      type: 'image/webp',
      size: MAX_CATALOG_IMAGE_BYTES + 1,
    }),
    /5 MiB/u,
  )
})

test('existing values load into peso edit fields without exposing floats', () => {
  assert.deepEqual(catalogItemToDraft(items[0]), {
    name: 'Chicken Adobo',
    category: 'ULAM',
    pricePesos: '85.00',
    internalDfPesos: '10.00',
  })
})

test('valid create/edit values become integer centavos and preserve photo path', () => {
  assert.deepEqual(
    catalogDraftToInput(
      'item-id',
      {
        name: '  Caldereta  ',
        category: 'ULAM',
        pricePesos: '95.50',
        internalDfPesos: '0',
      },
      'catalog/item-id/photo.jpg',
    ),
    {
      id: 'item-id',
      name: 'Caldereta',
      category: 'ULAM',
      priceCentavos: 9550,
      internalDfCentavos: 0,
      photoPath: 'catalog/item-id/photo.jpg',
    },
  )
})

test('invalid name, negative money, and excess decimals never reach mutation input', () => {
  const valid = {
    name: 'Rice',
    category: 'EXTRAS',
    pricePesos: '15',
    internalDfPesos: '2',
  }
  assert.equal(catalogDraftToInput('id', { ...valid, name: ' ' }), null)
  assert.equal(catalogDraftToInput('id', { ...valid, pricePesos: '-1' }), null)
  assert.equal(
    catalogDraftToInput('id', { ...valid, internalDfPesos: '1.999' }),
    null,
  )
})
