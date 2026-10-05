import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminMenuQueryKeys,
  catalogByCategory,
  customerPreviewItems,
  isValidPublishSelection,
  toggleMenuSelection,
  validateMenuImage,
} from '../../src/features/admin-menu/model.ts'

const catalog = [
  {
    id: 'adobo',
    name: 'Chicken Adobo',
    category: 'ULAM',
    priceCentavos: 8500,
    internalDfCentavos: 1000,
    photoPath: 'catalog/adobo/photo.jpg',
  },
  {
    id: 'flan',
    name: 'Leche Flan',
    category: 'DESSERTS',
    priceCentavos: 5000,
    internalDfCentavos: 0,
    photoPath: 'catalog/flan/photo.png',
  },
  {
    id: 'rice',
    name: 'Extra Rice',
    category: 'EXTRAS',
    priceCentavos: 1500,
    internalDfCentavos: 200,
    photoPath: 'catalog/rice/photo.webp',
  },
]

test('keeps active-menu and selectable-catalog query identities separate', () => {
  assert.deepEqual(adminMenuQueryKeys.active, ['admin-menu', 'active'])
  assert.deepEqual(adminMenuQueryKeys.catalog, ['admin-menu', 'catalog'])
})

test('groups selectable catalog items by the exact business categories', () => {
  assert.deepEqual(
    catalogByCategory(catalog).map((group) => [
      group.category,
      group.items.map((item) => item.id),
    ]),
    [
      ['ULAM', ['adobo']],
      ['DESSERTS', ['flan']],
      ['EXTRAS', ['rice']],
    ],
  )
})

test('selection toggles explicitly without duplicates', () => {
  assert.deepEqual(toggleMenuSelection([], 'adobo'), ['adobo'])
  assert.deepEqual(toggleMenuSelection(['adobo'], 'rice'), ['adobo', 'rice'])
  assert.deepEqual(toggleMenuSelection(['adobo', 'rice'], 'adobo'), ['rice'])
})

test('publish selection requires at least one unique active catalog id', () => {
  assert.equal(isValidPublishSelection([], catalog), false)
  assert.equal(isValidPublishSelection(['adobo'], catalog), true)
  assert.equal(isValidPublishSelection(['adobo', 'adobo'], catalog), false)
  assert.equal(isValidPublishSelection(['archived'], catalog), false)
})

test('menu image accepts JPEG, PNG, and WebP up to five MiB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validateMenuImage({ type, size: 1024 }), null)
  }
  assert.equal(validateMenuImage({ type: 'image/png', size: 5_242_880 }), null)
})

test('menu image rejects missing, empty, unsupported, and oversized files', () => {
  assert.match(validateMenuImage(null), /Choose/u)
  assert.match(validateMenuImage({ type: 'image/gif', size: 1024 }), /JPEG/u)
  assert.match(validateMenuImage({ type: 'image/png', size: 0 }), /empty/u)
  assert.match(
    validateMenuImage({ type: 'image/webp', size: 5_242_881 }),
    /5 MiB/u,
  )
})

test('customer preview keeps price and sold-out state but removes Internal DF', () => {
  const preview = customerPreviewItems({
    id: 'menu',
    imagePath: 'menus/menu/image.jpg',
    activatedAt: '2026-10-04T00:00:00Z',
    expiresAt: '2026-10-05T00:00:00Z',
    items: [
      {
        id: 'published-adobo',
        catalogItemId: 'adobo',
        name: 'Chicken Adobo',
        category: 'ULAM',
        priceCentavos: 8500,
        internalDfCentavos: 1000,
        photoPath: 'catalog/adobo/photo.jpg',
        isSoldOut: true,
        sortOrder: 0,
      },
    ],
  })
  assert.deepEqual(preview, [
    {
      id: 'published-adobo',
      name: 'Chicken Adobo',
      category: 'ULAM',
      priceCentavos: 8500,
      photoPath: 'catalog/adobo/photo.jpg',
      isSoldOut: true,
    },
  ])
  assert.equal('internalDfCentavos' in preview[0], false)
  assert.equal('catalogItemId' in preview[0], false)
})
