import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  fetchBackendUserBuyPrices,
  saveBackendUserBuyPrice,
  saveBackendUserEnergyBuyPrice,
} from '../api/backendApi'
import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'

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
        if (!getBackendAuthToken()) {
          set({ buyPricesByItemId: {}, energyPrice: '' })
          return
        }
        const remote = await fetchBackendUserBuyPrices()
        set({ buyPricesByItemId: remote.itemPrices, energyPrice: remote.energyBuyPrice })
      },
      setEnergyPrice: (value) => {
        set({ energyPrice: value })
        if (getBackendApiBaseUrl() && getBackendAuthToken()) {
          void saveBackendUserEnergyBuyPrice(value)
        }
      },
    }),
    {
      name: 'sc-vault-ingredient-prices-v2',
      partialize: (state) => ({ energyPrice: state.energyPrice }),
    },
  ),
)
