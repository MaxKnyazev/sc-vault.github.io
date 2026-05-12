import type { ListingItemWithId } from '../../entities/item/types'

/** Цвет рамки/свечения предмета из каталога (как на аукционе): учитывает rank в status.state при «пустом» color. */
export function pickListingItemQualityColor(item: ListingItemWithId | undefined): string | undefined {
  if (!item) return undefined
  const c = (item.color ?? '').trim()
  const s = (item.status?.state ?? '').trim()
  if (
    s &&
    (c === '' || c.toLowerCase() === '#ffffff' || c.toUpperCase() === 'DEFAULT' || c.toUpperCase() === 'NORMAL')
  ) {
    return s
  }
  return c || s || undefined
}
