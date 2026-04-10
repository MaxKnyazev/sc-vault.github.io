import { RouterProvider } from 'react-router-dom'
import { useEffect } from 'react'
import { appRouter } from './app/router'
import { useAuthStore } from './shared/store/authStore'
import { useAuctionBlacklistStore } from './shared/store/auctionBlacklistStore'
import { useAuctionPricesStore } from './shared/store/auctionPricesStore'

function App() {
  const bootstrapAuth = useAuthStore((s) => s.bootstrapAuth)

  useEffect(() => {
    void bootstrapAuth()
  }, [bootstrapAuth])

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
