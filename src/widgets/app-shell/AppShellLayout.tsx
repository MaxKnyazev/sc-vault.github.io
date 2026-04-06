import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  NavLink,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { StalcraftCredentialsNavFields } from '../../components/stalcraft-credentials-nav/StalcraftCredentialsNavFields'
import { ItemDetailsModal } from '../item-details-modal/ItemDetailsModal'

export function AppShellLayout() {
  const [opened, { toggle, close }] = useDisclosure()
  const { toggleColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('dark')
  const isDark = computedColorScheme === 'dark'
  const location = useLocation()

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
            <Text fw={700}>SC Vault</Text>
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
          </Stack>

          <Stack gap={0} style={{ marginTop: 'auto' }}>
            <StalcraftCredentialsNavFields />
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
      </AppShell.Main>
    </AppShell>
  )
}
