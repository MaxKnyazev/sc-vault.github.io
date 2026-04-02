import type { Realm } from '../../shared/config/app'
import { appConfig } from '../../shared/config/app'
import { getJson } from '../../shared/api/http'
import type { ListingItem } from './types'

export async function getItemsListing(
  realm: Realm = appConfig.defaultRealm,
): Promise<ListingItem[]> {
  const url = `${appConfig.githubRawBaseUrl}/${realm}/listing.json`
  return getJson<ListingItem[]>(url)
}
