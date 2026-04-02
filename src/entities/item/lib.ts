import { appConfig, type Realm } from '../../shared/config/app'
import type { ListingItem, ListingItemWithId } from './types'

export function getItemIdFromDataPath(dataPath: string): string {
  const normalized = dataPath.replaceAll('\\', '/')
  const fileName = normalized.split('/').pop() ?? ''
  return fileName.replace('.json', '')
}

export function getItemName(lines?: Record<string, string>): string {
  if (!lines) return 'Unknown item'

  return (
    lines[appConfig.defaultLanguage] ??
    lines.en ??
    Object.values(lines)[0] ??
    'Unknown item'
  )
}

export function buildItemIconUrl(iconPath: string, realm: Realm): string {
  return `${appConfig.githubRawBaseUrl}/${realm}${iconPath}`
}

export function toItemsById(
  listing: ListingItem[],
): Record<string, ListingItemWithId> {
  return listing.reduce<Record<string, ListingItemWithId>>((acc, entry) => {
    const id = getItemIdFromDataPath(entry.data)
    if (!id) return acc

    acc[id] = { ...entry, id }
    return acc
  }, {})
}
