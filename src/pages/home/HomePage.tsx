import { Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { PageContainer } from '../../components/page-container/PageContainer'

const QUICK_LINKS = [
  { to: '/crafts', label: 'Крафты', hint: 'Себестоимость и рецепты убежища' },
  { to: '/ingredients', label: 'Ингредиенты', hint: 'Скуп и цены материалов' },
  { to: '/crafts/orders', label: 'Заказы', hint: 'План закупки под крафт' },
  { to: '/auction-history', label: 'Аукцион', hint: 'Отслеживание и история' },
] as const

export function HomePage() {
  return (
    <PageContainer>
      <Stack gap="lg">
        <div className="hero-panel">
          <Title order={2} style={{ letterSpacing: '-0.02em' }}>
            Добро пожаловать в SCTool
          </Title>
          <Text c="dimmed" mt="xs" maw={560} lh={1.5}>
            Калькулятор себестоимости крафта, гибридные цены аукциона и планирование закупок для
            Stalcraft.
          </Text>
          <div className="hero-panel__grid">
            {QUICK_LINKS.map((item) => (
              <Link key={item.to} to={item.to} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="hero-tile">
                  <Text fw={700} size="sm">
                    {item.label}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4} lh={1.35}>
                    {item.hint}
                  </Text>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Stack>
    </PageContainer>
  )
}
