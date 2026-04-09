import { Loader, Stack, Text } from '@mantine/core'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { UserRole } from '../shared/api/backendApi'
import { useAuthStore } from '../shared/store/authStore'

type RequireRoleProps = {
  minimumRole: UserRole
}

function roleLevel(role: UserRole): number {
  switch (role) {
    case 'admin':
      return 3
    case 'user':
      return 2
    default:
      return 1
  }
}

export function RequireRole({ minimumRole }: RequireRoleProps) {
  const location = useLocation()
  const isAuthResolved = useAuthStore((s) => s.isAuthResolved)
  const user = useAuthStore((s) => s.user)

  if (!isAuthResolved) {
    return (
      <Stack gap="xs" align="center" py="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Проверка авторизации...
        </Text>
      </Stack>
    )
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  if (roleLevel(user.role) < roleLevel(minimumRole)) {
    return <Navigate to={user.role === 'blocked' ? '/profile' : '/'} replace />
  }

  return <Outlet />
}

