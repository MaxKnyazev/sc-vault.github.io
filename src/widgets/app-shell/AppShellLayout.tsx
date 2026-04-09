import {
  ActionIcon,
  AppShell,
  Avatar,
  Button,
  Burger,
  Group,
  NavLink,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ItemDetailsModal } from '../item-details-modal/ItemDetailsModal'
import { useAuthStore } from '../../shared/store/authStore'
import { getRoleLabel } from '../../shared/lib/authRole'
import { AuthModal } from '../auth/AuthModal'

export function AppShellLayout() {
  const [opened, { toggle, close }] = useDisclosure()
  const [authOpened, authModalHandlers] = useDisclosure()
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const { toggleColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('dark')
  const isDark = computedColorScheme === 'dark'
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const isAuthSubmitting = useAuthStore((s) => s.isSubmitting)
  const canUseCoreFeatures = user?.role === 'user' || user?.role === 'admin'
  const roleGlowColor =
    user?.role === 'admin' ? '#ef4444' : user?.role === 'user' ? '#3b82f6' : '#ffffff'

  useEffect(() => {
    if (!opened) {
      document.body.style.overflow = ''
      return
    }

    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [opened])

  useEffect(() => {
    close()
  }, [close, location.pathname])

  useEffect(() => {
    const routeTitleMap: Record<string, string> = {
      '/': 'Главная',
      '/crafts': 'Крафты',
      '/ingredients': 'Ингредиенты',
      '/profile': 'Профиль',
    }

    let pageTitle = routeTitleMap[location.pathname]
    if (!pageTitle) {
      if (location.pathname.startsWith('/crafts')) pageTitle = 'Крафты'
      else if (location.pathname.startsWith('/ingredients')) pageTitle = 'Ингредиенты'
      else if (location.pathname.startsWith('/profile')) pageTitle = 'Профиль'
      else pageTitle = 'Главная'
    }

    document.title = `SCTool - ${pageTitle}`
  }, [location.pathname])

  const getNavItemStyle = (active: boolean) =>
    ({
      borderRadius: 10,
      border: active
        ? '1px solid var(--mantine-color-blue-6)'
        : '1px solid var(--mantine-color-default-border)',
      background: active ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-body)',
      transition: 'all 120ms ease',
    }) as const

  return (
    <AppShell
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
      styles={{
        root: {
          backgroundColor: isDark ? undefined : '#ffffff',
        },
      }}
    >
      <AppShell.Navbar p="md">
        <Stack gap="md" h="100%">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text fw={700}>SCTool</Text>
            <ActionIcon
              variant="default"
              size="lg"
              onClick={toggleColorScheme}
              aria-label="Переключить тему"
              title="Переключить тему"
            >
              {isDark ? '🌙' : '☀️'}
            </ActionIcon>
          </Group>

          <Stack gap={4}>
          <NavLink
            component={Link}
            to="/"
            onClick={close}
            label="Главная"
            active={location.pathname === '/'}
            variant="subtle"
            style={getNavItemStyle(location.pathname === '/')}
            styles={{
              label: {
                fontWeight: 700,
                color: 'var(--mantine-color-text)',
              },
            }}
          />
          {canUseCoreFeatures ? (
            <NavLink
              component={Link}
              to="/crafts"
              onClick={close}
              label="Крафты"
              active={location.pathname.startsWith('/crafts')}
              variant="subtle"
              style={getNavItemStyle(location.pathname.startsWith('/crafts'))}
              styles={{
                label: {
                  fontWeight: 700,
                  color: 'var(--mantine-color-text)',
                },
              }}
            />
          ) : null}
          {canUseCoreFeatures ? (
            <NavLink
              component={Link}
              to="/ingredients"
              onClick={close}
              label="Ингредиенты"
              active={location.pathname.startsWith('/ingredients')}
              variant="subtle"
              style={getNavItemStyle(location.pathname.startsWith('/ingredients'))}
              styles={{
                label: {
                  fontWeight: 700,
                  color: 'var(--mantine-color-text)',
                },
              }}
            />
          ) : null}
          </Stack>

          <Stack gap="xs" style={{ marginTop: 'auto' }}>
            {!user ? (
              <Stack gap="xs">
                <Button
                  size="xs"
                  onClick={() => {
                    setAuthMode('login')
                    authModalHandlers.open()
                  }}
                >
                  Вход
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  color="gray"
                  onClick={() => {
                    setAuthMode('register')
                    authModalHandlers.open()
                  }}
                >
                  Регистрация
                </Button>
              </Stack>
            ) : (
              <Stack
                gap={6}
                p="xs"
                style={{
                  background: 'var(--mantine-color-body)',
                  borderRadius: 10,
                }}
              >
                <Group
                  wrap="nowrap"
                  gap="xs"
                  align="center"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    close()
                    void navigate('/profile')
                  }}
                >
                  <Avatar
                    radius="xl"
                    size={38}
                    src={user.avatarUrl ?? undefined}
                    name={user.nickname}
                    color="blue"
                    style={{
                      border: `1px solid ${roleGlowColor}`,
                      boxShadow: `0 0 10px ${roleGlowColor}`,
                    }}
                  />
                  <Stack gap={0}>
                    <Text fw={700} size="sm" style={{ lineHeight: 1.1 }}>
                      {user.nickname}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {getRoleLabel(user.role)}
                    </Text>
                  </Stack>
                </Group>
                <Button size="xs" variant="default" color="gray" loading={isAuthSubmitting} onClick={() => void logout()}>
                  Выйти
                </Button>
              </Stack>
            )}
          </Stack>

        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Burger
          opened={opened}
          onClick={toggle}
          hiddenFrom="sm"
          size="sm"
          style={{ position: 'fixed', top: 12, left: 12, zIndex: 300 }}
          aria-label="Открыть меню"
        />
        <Outlet />
        <ItemDetailsModal />
        <AuthModal opened={authOpened} onClose={authModalHandlers.close} initialMode={authMode} />
      </AppShell.Main>
    </AppShell>
  )
}
