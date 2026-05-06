import { create } from 'zustand'
import { getHideoutRecipes } from './api'
import type { HideoutRecipe } from './types'
import { extractUniqueCraftableItemIds } from '../../shared/lib/extractUniqueCraftableItemIds'
import { getItemsListing } from '../item/api'
import { toItemsById } from '../item/lib'
import type { ListingItemWithId } from '../item/types'
import { appConfig, type Realm } from '../../shared/config/app'
import { collectMissingCraftBoostFactors } from './bonus'
import { hideoutBonusConfig } from '../../shared/config/hideout-bonus'
import { buildCustomManualRecipes } from '../../shared/lib/customManualRecipes'

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
      const customManualRecipes = buildCustomManualRecipes(itemsById)
      const mergedRecipes = [...recipesResponse.recipes, ...customManualRecipes]
      const craftableItemIds = extractUniqueCraftableItemIds(mergedRecipes)
      const missingCraftBoostReport = collectMissingCraftBoostFactors(mergedRecipes)
      const explicitPerkFactors = Object.keys(hideoutBonusConfig.craftBoostFactorByPerk).length
      // Пустая карта перков — для всех рецептов осознанно используется defaultCraftBoostFactor, варнинг только шумит.
      if (
        explicitPerkFactors > 0 &&
        missingCraftBoostReport.craftedItemsWithoutExplicitFactor.length > 0 &&
        import.meta.env.DEV
      ) {
        const d = hideoutBonusConfig.defaultCraftBoostFactor
        console.warn(
          `[craft-boost] Some crafted items use stations without craftBoostFactorByPerk entry; default=${d}. Count=${missingCraftBoostReport.craftedItemsWithoutExplicitFactor.length}. Sample: ${missingCraftBoostReport.craftedItemsWithoutExplicitFactor
            .slice(0, 10)
            .join(', ')}`,
        )
      }

      set({
        recipes: mergedRecipes,
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
