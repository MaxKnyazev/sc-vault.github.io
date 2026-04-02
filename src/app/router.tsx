import { createBrowserRouter } from 'react-router-dom'
import { AppShellLayout } from '../widgets/app-shell/AppShellLayout'
import { HomePage } from '../pages/home/HomePage'
import { CraftsPage } from '../pages/crafts/CraftsPage'
import { IngredientsPage } from '../pages/ingredients/IngredientsPage'
import { NotFoundPage } from '../pages/not-found/NotFoundPage'

export const appRouter = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShellLayout />,
      children: [
        {
          index: true,
          element: <HomePage />,
        },
        {
          path: 'crafts',
          element: <CraftsPage />,
        },
        {
          path: 'ingredients',
          element: <IngredientsPage />,
        },
      ],
    },
    {
      path: '*',
      element: <NotFoundPage />,
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  },
)
