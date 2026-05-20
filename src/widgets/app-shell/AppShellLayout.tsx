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
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ItemDetailsModal } from '../item-details-modal/ItemDetailsModal'
import { AuctionHistoryItemModal } from '../auction-history-item-modal/AuctionHistoryItemModal'
import { TrackedAuctionDealMonitor } from '../tracked-auction-deal-monitor/TrackedAuctionDealMonitor'
import { AuctionDealToastPortal } from '../auction-deal-toast-portal/AuctionDealToastPortal'
import { useAuthStore } from '../../shared/store/authStore'
import { getRoleLabel } from '../../shared/lib/authRole'
import { AuthModal } from '../auth/AuthModal'

export function AppShellLayout() {
  const [opened, { toggle, close }] = useDisclosure()
  const [authOpened, authModalHandlers] = useDisclosure()
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const isAuthSubmitting = useAuthStore((s) => s.isSubmitting)
  const canUseCoreFeatures = user?.role === 'user' || user?.role === 'admin'
  const isAdmin = user?.role === 'admin'
  const roleGlowColor =
    user?.role === 'admin' ? '#ef4444' : user?.role === 'user' ? '#3b82f6' : '#ffffff'
  const auctionDealToastsEnabled = user?.auctionTrackingNotifications !== false

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
      '/crafts/orders': 'Заказы',
      '/ingredients': 'Ингредиенты',
      '/auction-history': 'Отслеживание аукциона',
      '/profile': 'Профиль',
      '/users': 'Пользователи',
    }

    let pageTitle = routeTitleMap[location.pathname]
    if (!pageTitle) {
      if (location.pathname === '/crafts/orders') pageTitle = 'Заказы'
      else if (location.pathname.startsWith('/crafts')) pageTitle = 'Крафты'
      else if (location.pathname.startsWith('/ingredients')) pageTitle = 'Ингредиенты'
      else if (location.pathname.startsWith('/auction-history')) pageTitle = 'Отслеживание аукциона'
      else if (location.pathname.startsWith('/profile')) pageTitle = 'Профиль'
      else if (location.pathname.startsWith('/users')) pageTitle = 'Пользователи'
      else pageTitle = 'Главная'
    }

    document.title = `SCTool - ${pageTitle}`
  }, [location.pathname])

  const navRootClass = (active: boolean) =>
    active ? 'app-nav-link app-nav-link--active' : 'app-nav-link'

  const navLabelStyles = { label: { fontWeight: 700 } } as const

  return (
    <AppShell
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
      styles={{
        root: {
          '--app-layout-bg': 'var(--sc-bg)',
          backgroundColor: 'var(--app-layout-bg)',
        },
      }}
    >
      <AppShell.Navbar p="md">
        <Stack gap="md" h="100%">
          <Text className="app-brand">SCTool</Text>

          <Stack gap={4}>
          <NavLink
            component={Link}
            to="/"
            onClick={close}
            label="Главная"
            active={location.pathname === '/'}
            classNames={{ root: navRootClass(location.pathname === '/') }}
            styles={navLabelStyles}
          />
          {canUseCoreFeatures ? (
            <NavLink
              component={Link}
              to="/crafts"
              onClick={close}
              label="Крафты"
              active={location.pathname === '/crafts'}
              classNames={{ root: navRootClass(location.pathname === '/crafts') }}
              styles={navLabelStyles}
            />
          ) : null}
          {canUseCoreFeatures ? (
            <NavLink
              component={Link}
              to="/ingredients"
              onClick={close}
              label="Ингредиенты"
              active={location.pathname.startsWith('/ingredients')}
              classNames={{ root: navRootClass(location.pathname.startsWith('/ingredients')) }}
              styles={navLabelStyles}
            />
          ) : null}
          {canUseCoreFeatures ? (
            <NavLink
              component={Link}
              to="/auction-history"
              onClick={close}
              label="Отслеживание аукциона"
              active={location.pathname.startsWith('/auction-history')}
              classNames={{ root: navRootClass(location.pathname.startsWith('/auction-history')) }}
              styles={navLabelStyles}
            />
          ) : null}
          {canUseCoreFeatures ? (
            <NavLink
              component={Link}
              to="/crafts/orders"
              onClick={close}
              label="Заказы"
              active={location.pathname === '/crafts/orders'}
              classNames={{ root: navRootClass(location.pathname === '/crafts/orders') }}
              styles={navLabelStyles}
            />
          ) : null}
          </Stack>

          <Stack gap="xs" style={{ marginTop: 'auto' }}>
            {isAdmin ? (
              <NavLink
                component={Link}
                to="/users"
                onClick={close}
                label="Пользователи"
                active={location.pathname.startsWith('/users')}
                classNames={{ root: navRootClass(location.pathname.startsWith('/users')) }}
                styles={navLabelStyles}
              />
            ) : null}
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
              <Stack gap={6} p="xs" className="app-user-panel">
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Group
                    wrap="nowrap"
                    gap="xs"
                    align="center"
                    style={{ cursor: 'pointer', minWidth: 0, flex: 1 }}
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
                      color="gray"
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.28)',
                        border: `1px solid ${roleGlowColor}`,
                        boxShadow: `0 0 10px ${roleGlowColor}`,
                      }}
                    />
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Text fw={700} size="md" style={{ lineHeight: 1.1 }} truncate>
                        {user.nickname}
                      </Text>
                      <Text c="dimmed" size="xs" truncate>
                        {getRoleLabel(user.role)}
                      </Text>
                    </Stack>
                  </Group>
                  <ActionIcon
                    variant="default"
                    color="gray"
                    size="lg"
                    aria-label="Выйти"
                    title="Выйти"
                    loading={isAuthSubmitting}
                    onClick={() => void logout()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M10 17L15 12L10 7M15 12H3M8 3H18C19.1046 3 20 3.89543 20 5V19C20 20.1046 19.1046 21 18 21H8"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </ActionIcon>
                </Group>
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
        <TrackedAuctionDealMonitor />
        {auctionDealToastsEnabled ? <AuctionDealToastPortal /> : null}
        <ItemDetailsModal />
        <AuctionHistoryItemModal />
        <AuthModal opened={authOpened} onClose={authModalHandlers.close} initialMode={authMode} />
      </AppShell.Main>
    </AppShell>
  )
}
