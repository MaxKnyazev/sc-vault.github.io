import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type FavoritesState = {
  favoriteItemIds: string[]
  favoriteCraftIds: string[]
  toggleFavorite: (itemId: string) => void
  isFavorite: (itemId: string) => boolean
  toggleFavoriteCraft: (craftId: string) => void
  isFavoriteCraft: (craftId: string) => boolean
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favoriteItemIds: [],
      favoriteCraftIds: [],
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
      toggleFavoriteCraft: (craftId) => {
        const current = get().favoriteCraftIds
        const has = current.includes(craftId)
        set({
          favoriteCraftIds: has
            ? current.filter((id) => id !== craftId)
            : [...current, craftId],
        })
      },
      isFavoriteCraft: (craftId) => get().favoriteCraftIds.includes(craftId),
    }),
    {
      name: 'sc-vault-favorites',
    },
  ),
)
