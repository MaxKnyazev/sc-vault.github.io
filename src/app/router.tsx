import { createBrowserRouter } from 'react-router-dom'
import { AppShellLayout } from '../widgets/app-shell/AppShellLayout'
import { HomePage } from '../pages/home/HomePage'
import { CraftsPage } from '../pages/crafts/CraftsPage'
import { IngredientsPage } from '../pages/ingredients/IngredientsPage'
import { NotFoundPage } from '../pages/not-found/NotFoundPage'
import { ProfilePage } from '../pages/profile/ProfilePage'
import { RequireRole } from './RequireRole'
import { UsersPage } from '../pages/users/UsersPage'
import { AuctionHistoryPage } from '../pages/auction-history/AuctionHistoryPage'

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
          element: <RequireRole minimumRole="user" />,
          children: [
            {
              index: true,
              element: <CraftsPage />,
            },
          ],
        },
        {
          path: 'ingredients',
          element: <RequireRole minimumRole="user" />,
          children: [
            {
              index: true,
              element: <IngredientsPage />,
            },
          ],
        },
        {
          path: 'auction-history',
          element: <RequireRole minimumRole="user" />,
          children: [
            {
              index: true,
              element: <AuctionHistoryPage />,
            },
          ],
        },
        {
          path: 'profile',
          element: <RequireRole minimumRole="blocked" />,
          children: [
            {
              index: true,
              element: <ProfilePage />,
            },
          ],
        },
        {
          path: 'users',
          element: <RequireRole minimumRole="admin" />,
          children: [
            {
              index: true,
              element: <UsersPage />,
            },
          ],
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
