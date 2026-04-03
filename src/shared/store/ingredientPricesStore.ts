import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type IngredientPricesState = {
  buyPricesByItemId: Record<string, string>
  energyPrice: string
  setBuyPrice: (itemId: string, value: string) => void
  setEnergyPrice: (value: string) => void
}

export const useIngredientPricesStore = create<IngredientPricesState>()(
  persist(
    (set) => ({
      buyPricesByItemId: {},
      energyPrice: '',
      setBuyPrice: (itemId, value) => {
        set((state) => ({
          buyPricesByItemId: {
            ...state.buyPricesByItemId,
            [itemId]: value,
          },
        }))
      },
      setEnergyPrice: (value) => {
        set({ energyPrice: value })
      },
    }),
    {
      name: 'sc-vault-ingredient-prices',
    },
  ),
)
