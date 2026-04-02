import { appConfig, type Realm } from '../../shared/config/app'
import { getJson } from '../../shared/api/http'
import type { HideoutRecipesResponse } from './types'

export async function getHideoutRecipes(
  realm: Realm = appConfig.defaultRealm,
): Promise<HideoutRecipesResponse> {
  const url = `${appConfig.githubRawBaseUrl}/${realm}/hideout_recipes.json`
  return getJson<HideoutRecipesResponse>(url)
}
