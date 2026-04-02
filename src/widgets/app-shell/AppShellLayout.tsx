import { AppShell, Burger, Group, NavLink, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, Outlet, useLocation } from 'react-router-dom'

export function AppShellLayout() {
  const [opened, { toggle }] = useDisclosure()
  const location = useLocation()
  const getNavItemStyle = (active: boolean) =>
    ({
      borderRadius: 10,
      border: active
        ? '1px solid var(--mantine-color-blue-6)'
        : '1px solid var(--mantine-color-dark-4)',
      background: active ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-dark-6)',
      transition: 'all 120ms ease',
    }) as const

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700}>SC Vault</Text>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap={4}>
          <NavLink
            component={Link}
            to="/"
            label="Главная"
            active={location.pathname === '/'}
            variant="subtle"
            style={getNavItemStyle(location.pathname === '/')}
            styles={{
              label: {
                fontWeight: 700,
                color: 'var(--mantine-color-gray-0)',
              },
            }}
          />
          <NavLink
            component={Link}
            to="/crafts"
            label="Крафты"
            active={location.pathname.startsWith('/crafts')}
            variant="subtle"
            style={getNavItemStyle(location.pathname.startsWith('/crafts'))}
            styles={{
              label: {
                fontWeight: 700,
                color: 'var(--mantine-color-gray-0)',
              },
            }}
          />
          <NavLink
            component={Link}
            to="/ingredients"
            label="Ингредиенты"
            active={location.pathname.startsWith('/ingredients')}
            variant="subtle"
            style={getNavItemStyle(location.pathname.startsWith('/ingredients'))}
            styles={{
              label: {
                fontWeight: 700,
                color: 'var(--mantine-color-gray-0)',
              },
            }}
          />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
