import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type FavoritesState = {
  favoriteItemIds: string[]
  toggleFavorite: (itemId: string) => void
  isFavorite: (itemId: string) => boolean
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favoriteItemIds: [],
      toggleFavorite: (itemId) => {
        const current = get().favoriteItemIds
        const has = current.includes(itemId)
        set({
          favoriteItemIds: has
            ? current.filter((id) => id !== itemId)
            : [...current, itemId],
        })
      },
      isFavorite: (itemId) => get().favoriteItemIds.includes(itemId),
    }),
    {
      name: 'sc-vault-favorites',
    },
  ),
)
