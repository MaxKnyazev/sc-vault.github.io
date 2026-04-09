import { RouterProvider } from 'react-router-dom'
import { useEffect } from 'react'
import { appRouter } from './app/router'
import { useAuthStore } from './shared/store/authStore'

function App() {
  const bootstrapAuth = useAuthStore((s) => s.bootstrapAuth)

  useEffect(() => {
    void bootstrapAuth()
  }, [bootstrapAuth])

  return <RouterProvider router={appRouter} />
}

export default App
