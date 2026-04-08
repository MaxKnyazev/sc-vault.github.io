import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchBackendUserBuyPrices, saveBackendUserBuyPrice } from '../api/backendApi'
import { getBackendApiBaseUrl } from '../config/backendApi'

type IngredientPricesState = {
  buyPricesByItemId: Record<string, string>
  energyPrice: string
  setBuyPrice: (itemId: string, value: string) => void
  loadRemoteBuyPrices: () => Promise<void>
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
        if (getBackendApiBaseUrl()) {
          void saveBackendUserBuyPrice(itemId, value)
        }
      },
      loadRemoteBuyPrices: async () => {
        if (!getBackendApiBaseUrl()) return
        const remote = await fetchBackendUserBuyPrices()
        if (Object.keys(remote).length === 0) return
        set((state) => ({
          buyPricesByItemId: {
            ...state.buyPricesByItemId,
            ...remote,
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
