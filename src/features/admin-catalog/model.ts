import {
  centavosToPesoInput,
  pesoInputToCentavos,
} from '../../lib/money-input.ts'
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_TYPES,
  validateProductImage,
} from '../../lib/image-upload.ts'
import type {
  ArchiveFilter,
  CatalogCategory,
  CatalogItem,
  CatalogItemInput,
} from './types.ts'

export const MAX_CATALOG_IMAGE_BYTES = MAX_PRODUCT_IMAGE_BYTES
export const CATALOG_IMAGE_TYPES = PRODUCT_IMAGE_TYPES
export const catalogQueryKey = ['admin-catalog'] as const

export type CatalogDraft = {
  name: string
  category: CatalogCategory
  pricePesos: string
  internalDfPesos: string
}

export function filterCatalogItems(
  items: CatalogItem[],
  search: string,
  category: CatalogCategory | 'ALL',
  archive: ArchiveFilter,
) {
  const query = search.trim().toLocaleLowerCase()
  return items.filter(
    (item) =>
      (!query || item.name.toLocaleLowerCase().includes(query)) &&
      (category === 'ALL' || item.category === category) &&
      (archive === 'ALL' ||
        (archive === 'ARCHIVED' ? item.isArchived : !item.isArchived)),
  )
}

export function validateCatalogImage(file: File | null): string | null {
  return (
    validateProductImage(file, 'food photo')?.replace('image', 'photo') ?? null
  )
}

export function catalogItemToDraft(item: CatalogItem): CatalogDraft {
  return {
    name: item.name,
    category: item.category,
    pricePesos: centavosToPesoInput(item.priceCentavos),
    internalDfPesos: centavosToPesoInput(item.internalDfCentavos),
  }
}

export function catalogDraftToInput(
  id: string,
  draft: CatalogDraft,
  photoPath?: string,
): CatalogItemInput | null {
  const priceCentavos = pesoInputToCentavos(draft.pricePesos)
  const internalDfCentavos = pesoInputToCentavos(draft.internalDfPesos)
  if (
    !draft.name.trim() ||
    draft.name.trim().length > 160 ||
    priceCentavos === null ||
    priceCentavos < 0 ||
    internalDfCentavos === null ||
    internalDfCentavos < 0
  )
    return null
  return {
    id,
    name: draft.name.trim(),
    category: draft.category,
    priceCentavos,
    internalDfCentavos,
    photoPath,
  }
}
