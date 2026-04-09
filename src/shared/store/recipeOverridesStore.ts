import { create } from 'zustand'
import {
  bulkSaveRecipeResultOverrides,
  fetchRecipeResultOverrides,
  saveRecipeResultOverride,
  type RecipeResultOverride,
} from '../api/backendApi'
import { getBackendApiBaseUrl } from '../config/backendApi'

type RecipeOverridesState = {
  byRecipeId: Record<string, RecipeResultOverride>
  isLoading: boolean
  isSaving: boolean
  error: string | null
  loadOverrides: () => Promise<void>
  saveOne: (override: Omit<RecipeResultOverride, 'updatedAt'>) => Promise<void>
  saveBulk: (items: Array<Omit<RecipeResultOverride, 'updatedAt'>>) => Promise<number>
  resetError: () => void
}

export const useRecipeOverridesStore = create<RecipeOverridesState>((set) => ({
  byRecipeId: {},
  isLoading: false,
  isSaving: false,
  error: null,
  resetError: () => set({ error: null }),
  loadOverrides: async () => {
    if (!getBackendApiBaseUrl()) return
    set({ isLoading: true, error: null })
    try {
      const byRecipeId = await fetchRecipeResultOverrides()
      set({ byRecipeId, isLoading: false })
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },
  saveOne: async (override) => {
    set({ isSaving: true, error: null })
    try {
      await saveRecipeResultOverride(override)
      const next: RecipeResultOverride = {
        ...override,
        updatedAt: new Date().toISOString(),
      }
      set((state) => ({
        isSaving: false,
        byRecipeId: {
          ...state.byRecipeId,
          [override.recipeId]: next,
        },
      }))
    } catch (err) {
      set({
        isSaving: false,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },
  saveBulk: async (items) => {
    set({ isSaving: true, error: null })
    try {
      const updated = await bulkSaveRecipeResultOverrides(items)
      const now = new Date().toISOString()
      set((state) => {
        const nextByRecipeId = { ...state.byRecipeId }
        for (const item of items) {
          nextByRecipeId[item.recipeId] = { ...item, updatedAt: now }
        }
        return { byRecipeId: nextByRecipeId, isSaving: false }
      })
      return updated
    } catch (err) {
      set({
        isSaving: false,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },
}))

