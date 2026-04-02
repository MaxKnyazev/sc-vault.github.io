import { create } from 'zustand'
import { getHideoutRecipes } from './api'
import type { HideoutRecipe } from './types'
import { extractUniqueCraftableItemIds } from '../../shared/lib/extractUniqueCraftableItemIds'
import { getItemsListing } from '../item/api'
import { toItemsById } from '../item/lib'
import type { ListingItemWithId } from '../item/types'
import { appConfig, type Realm } from '../../shared/config/app'

type HideoutStoreState = {
  realm: Realm
  recipes: HideoutRecipe[]
  craftableItemIds: string[]
  itemsById: Record<string, ListingItemWithId>
  isLoading: boolean
  error: string | null
  fetchRecipes: () => Promise<void>
}

export const useHideoutStore = create<HideoutStoreState>((set) => ({
  realm: appConfig.defaultRealm,
  recipes: [],
  craftableItemIds: [],
  itemsById: {},
  isLoading: false,
  error: null,
  fetchRecipes: async () => {
    set({ isLoading: true, error: null })

    try {
      const [recipesResponse, listingResponse] = await Promise.all([
        getHideoutRecipes(),
        getItemsListing(),
      ])

      const itemsById = toItemsById(listingResponse)
      const craftableItemIds = extractUniqueCraftableItemIds(recipesResponse.recipes)

      set({
        recipes: recipesResponse.recipes,
        craftableItemIds,
        itemsById,
        isLoading: false,
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  },
}))
