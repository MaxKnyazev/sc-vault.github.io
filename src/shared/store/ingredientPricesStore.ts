import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type IngredientPricesState = {
  buyPricesByItemId: Record<string, string>
  setBuyPrice: (itemId: string, value: string) => void
}

export const useIngredientPricesStore = create<IngredientPricesState>()(
  persist(
    (set) => ({
      buyPricesByItemId: {},
      setBuyPrice: (itemId, value) => {
        set((state) => ({
          buyPricesByItemId: {
            ...state.buyPricesByItemId,
            [itemId]: value,
          },
        }))
      },
    }),
    {
      name: 'sc-vault-ingredient-prices',
    },
  ),
)
