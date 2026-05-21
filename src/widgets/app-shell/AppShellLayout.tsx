import {
  ActionIcon,
  AppShell,
  Avatar,
  Box,
  Burger,
  Button,
  Group,
  NavLink,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ItemDetailsModal } from '../item-details-modal/ItemDetailsModal'
import { AuctionHistoryItemModal } from '../auction-history-item-modal/AuctionHistoryItemModal'
import { TrackedAuctionDealMonitor } from '../tracked-auction-deal-monitor/TrackedAuctionDealMonitor'
import { AuctionDealToastPortal } from '../auction-deal-toast-portal/AuctionDealToastPortal'
import { useAuthStore } from '../../shared/store/authStore'
import { getRoleLabel } from '../../shared/lib/authRole'
import { AuthModal } from '../auth/AuthModal'
import {
  NavIconAuction,
  NavIconCollapse,
  NavIconCrafts,
  NavIconHome,
  NavIconIngredients,
  NavIconLogout,
  NavIconOrders,
  NavIconUsers,
} from './navIcons'

const NAV_COLLAPSED_KEY = 'sc-vault-nav-collapsed'
const NAV_WIDTH_EXPANDED = 212
const NAV_WIDTH_COLLAPSED = 72

type NavItemDef = {
  to: string
  label: string
  icon: ReactNode
  match: (path: string) => boolean
  requiresAuth?: boolean
}

export function AppShellLayout() {
  const [opened, { toggle, close }] = useDisclosure()
  const [authOpened, authModalHandlers] = useDisclosure()
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const isDesktop = useMediaQuery('(min-width: 48.001em)')
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

  const desktopCollapsed = Boolean(isDesktop && navCollapsed)
  const navbarWidth = desktopCollapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH_EXPANDED

  const toggleNavCollapsed = () => {
    setNavCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(NAV_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const navItems: NavItemDef[] = useMemo(
    () => [
      {
        to: '/',
        label: 'Главная',
        icon: <NavIconHome />,
        match: (path) => path === '/',
      },
      {
        to: '/crafts',
        label: 'Крафты',
        icon: <NavIconCrafts />,
        match: (path) => path === '/crafts',
        requiresAuth: true,
      },
      {
        to: '/ingredients',
        label: 'Игредиенты',
        icon: <NavIconIngredients />,
        match: (path) => path.startsWith('/ingredients'),
        requiresAuth: true,
      },
      {
        to: '/auction-history',
        label: 'Отслеживание аукциона',
        icon: <NavIconAuction />,
        match: (path) => path.startsWith('/auction-history'),
        requiresAuth: true,
      },
      {
        to: '/crafts/orders',
        label: 'Заказы',
        icon: <NavIconOrders />,
        match: (path) => path === '/crafts/orders',
        requiresAuth: true,
      },
    ],
    [],
  )

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

  const navLinkStyles = desktopCollapsed
    ? ({
        root: { justifyContent: 'center', padding: '10px 8px' },
        section: { marginInlineEnd: 0 },
        label: { display: 'none' },
        body: { display: 'none' },
      } as const)
    : ({ label: { fontWeight: 700 } } as const)

  const renderNavLink = (item: NavItemDef) => {
    const active = item.match(location.pathname)
    const link = (
      <NavLink
        component={Link}
        to={item.to}
        onClick={close}
        label={item.label}
        leftSection={item.icon}
        active={active}
        classNames={{ root: navRootClass(active) }}
        styles={navLinkStyles}
      />
    )
    if (!desktopCollapsed) return link
    return (
      <Tooltip label={item.label} position="right" withArrow openDelay={200}>
        {link}
      </Tooltip>
    )
  }

  return (
    <AppShell
      className={desktopCollapsed ? 'app-shell app-shell--nav-collapsed' : 'app-shell'}
      navbar={{
        width: navbarWidth,
        breakpoint: 'sm',
        collapsed: { mobile: !opened, desktop: false },
      }}
      padding={{ base: 0, sm: 'xs' }}
      transitionDuration={280}
      transitionTimingFunction="cubic-bezier(0.22, 1, 0.36, 1)"
      styles={{
        root: {
          '--app-layout-bg': 'var(--sc-bg)',
          backgroundColor: 'var(--app-layout-bg)',
        },
      }}
    >
      <AppShell.Navbar p={desktopCollapsed ? 'sm' : 'md'} className="app-shell-navbar">
        <Stack gap="md" h="100%">
          <Group
            justify={desktopCollapsed ? 'center' : 'space-between'}
            wrap="nowrap"
            className="app-shell-navbar__header"
          >
            <Text className="app-brand app-brand--full" fw={800}>
              SCTool
            </Text>
            <Text className="app-brand app-brand--compact" fw={800}>
              SC
            </Text>
            {isDesktop ? (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                onClick={toggleNavCollapsed}
                aria-label={desktopCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
                title={desktopCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
              >
                <NavIconCollapse collapsed={desktopCollapsed} />
              </ActionIcon>
            ) : null}
          </Group>

          <Stack gap={4}>
            {navItems
              .filter((item) => !item.requiresAuth || canUseCoreFeatures)
              .map((item) => (
                <Box key={item.to}>{renderNavLink(item)}</Box>
              ))}
          </Stack>

          <Stack gap="xs" style={{ marginTop: 'auto' }}>
            {isAdmin ? (
              <Box>
                {desktopCollapsed ? (
                  <Tooltip label="Пользователи" position="right" withArrow openDelay={200}>
                    <NavLink
                      component={Link}
                      to="/users"
                      onClick={close}
                      label="Пользователи"
                      leftSection={<NavIconUsers />}
                      active={location.pathname.startsWith('/users')}
                      classNames={{ root: navRootClass(location.pathname.startsWith('/users')) }}
                      styles={navLinkStyles}
                    />
                  </Tooltip>
                ) : (
                  <NavLink
                    component={Link}
                    to="/users"
                    onClick={close}
                    label="Пользователи"
                    leftSection={<NavIconUsers />}
                    active={location.pathname.startsWith('/users')}
                    classNames={{ root: navRootClass(location.pathname.startsWith('/users')) }}
                    styles={navLinkStyles}
                  />
                )}
              </Box>
            ) : null}
            {!user ? (
              <Stack gap="xs">
                <Button
                  size="xs"
                  fullWidth={!desktopCollapsed}
                  onClick={() => {
                    setAuthMode('login')
                    authModalHandlers.open()
                  }}
                >
                  {desktopCollapsed ? 'Вх' : 'Вход'}
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  color="gray"
                  fullWidth={!desktopCollapsed}
                  onClick={() => {
                    setAuthMode('register')
                    authModalHandlers.open()
                  }}
                >
                  {desktopCollapsed ? 'Рг' : 'Регистрация'}
                </Button>
              </Stack>
            ) : desktopCollapsed ? (
              <Stack gap={8} align="center" className="app-user-panel app-user-panel--compact">
                <Tooltip label={`${user.nickname} · ${getRoleLabel(user.role)}`} position="right" withArrow>
                  <Avatar
                    radius="xl"
                    size={40}
                    src={user.avatarUrl ?? undefined}
                    name={user.nickname}
                    color="gray"
                    style={{
                      cursor: 'pointer',
                      backgroundColor: 'rgba(0,0,0,0.28)',
                      border: `1px solid ${roleGlowColor}`,
                      boxShadow: `0 0 10px ${roleGlowColor}`,
                    }}
                    onClick={() => {
                      close()
                      void navigate('/profile')
                    }}
                  />
                </Tooltip>
                <Tooltip label="Выйти" position="right" withArrow>
                  <ActionIcon
                    variant="default"
                    color="gray"
                    size="lg"
                    aria-label="Выйти"
                    loading={isAuthSubmitting}
                    onClick={() => void logout()}
                  >
                    <NavIconLogout />
                  </ActionIcon>
                </Tooltip>
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
                    <NavIconLogout />
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
