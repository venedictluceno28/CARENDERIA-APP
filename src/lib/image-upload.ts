export const MAX_PRODUCT_IMAGE_BYTES = 5_242_880
export const PRODUCT_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export function validateProductImage(
  file: File | null,
  label = 'image',
): string | null {
  if (!file) return `Choose a ${label}.`
  if (!PRODUCT_IMAGE_TYPES.has(file.type))
    return 'Use a JPEG, PNG, or WebP image.'
  if (file.size < 1) return 'The selected image is empty.'
  if (file.size > MAX_PRODUCT_IMAGE_BYTES)
    return 'The image must be 5 MiB or smaller.'
  return null
}
