import { RouterProvider } from 'react-router-dom'
import { useEffect } from 'react'
import { appRouter } from './app/router'
import { useAuthStore } from './shared/store/authStore'
import { useAuctionBlacklistStore } from './shared/store/auctionBlacklistStore'
import { useAuctionPricesStore } from './shared/store/auctionPricesStore'
import { useIngredientPricesStore } from './shared/store/ingredientPricesStore'

function App() {
  const bootstrapAuth = useAuthStore((s) => s.bootstrapAuth)
  const token = useAuthStore((s) => s.token)
  const isAuthResolved = useAuthStore((s) => s.isAuthResolved)
  const loadRemoteBuyPrices = useIngredientPricesStore((s) => s.loadRemoteBuyPrices)

  useEffect(() => {
    void bootstrapAuth()
  }, [bootstrapAuth])

  useEffect(() => {
    if (!isAuthResolved) return
    void loadRemoteBuyPrices()
  }, [isAuthResolved, token, loadRemoteBuyPrices])

  useEffect(() => {
    void (async () => {
      await useAuctionBlacklistStore.getState().load()
      const bl = useAuctionBlacklistStore.getState().blacklist
      const remove = useAuctionPricesStore.getState().removeItemFromCache
      for (const id of bl) {
        remove(id)
      }
    })()
  }, [])

  return <RouterProvider router={appRouter} />
}

export default App
