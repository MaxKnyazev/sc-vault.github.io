import { Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { PageContainer } from '../../components/page-container/PageContainer'
import { useAuthStore } from '../../shared/store/authStore'

const SITE_SECTIONS = [
  {
    label: 'Крафты',
    hint: 'Себестоимость и рецепты убежища',
    description:
      'Расчёт себестоимости по рецептам убежища: ингредиенты, энергия, бонусы веток крафта, переопределение результатов. Сравнение вариантов и избранные рецепты.',
    to: '/crafts',
  },
  {
    label: 'Ингредиенты',
    hint: 'Скуп и цены материалов',
    description:
      'Справочник материалов с ценами скупа, привязкой к аукциону и подсказками по ликвидности. Удобно задавать закупочные цены для расчётов.',
    to: '/ingredients',
  },
  {
    label: 'Заказы',
    hint: 'План закупки под крафт',
    description:
      'Заказы на крафт: список рецептов, количество, дедлайны, сводка ингредиентов к закупке с учётом остатков между строками заказа.',
    to: '/crafts/orders',
  },
  {
    label: 'Отслеживание аукциона',
    hint: 'История, лоты и уведомления',
    description:
      'Отслеживание предметов на аукционе, гибридные оценки цен, история сделок, активные лоты и уведомления о выгодных предложениях.',
    to: '/auction-history',
  },
] as const

function hasCoreAccess(role: string | undefined): boolean {
  return role === 'user' || role === 'admin'
}

export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const fullAccess = hasCoreAccess(user?.role)

  return (
    <PageContainer>
      <Stack gap="lg">
        <div className="hero-panel">
          <Title order={2} style={{ letterSpacing: '-0.02em' }}>
            Добро пожаловать в SCTool
          </Title>
          <Text c="dimmed" mt="xs" maw={640} lh={1.5}>
            Калькулятор себестоимости крафта, гибридные цены аукциона и планирование закупок для
            Stalcraft.
          </Text>

          {!fullAccess ? (
            <Text size="sm" c="dimmed" mt="md" maw={640} lh={1.5}>
              {user?.role === 'blocked'
                ? 'У вашей учётной записи ограниченный доступ: ниже — обзор разделов сервиса. Для работы с калькулятором и аукционом администратор должен назначить роль «Пользователь».'
                : 'Ниже — обзор возможностей SCTool. Чтобы открыть разделы, войдите или зарегистрируйтесь; после одобрения учётной записи станут доступны крафты, ингредиенты, заказы и аукцион.'}
            </Text>
          ) : null}

          <div className="hero-panel__grid">
            {SITE_SECTIONS.map((item) =>
              fullAccess ? (
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
              ) : (
                <div key={item.to} className="hero-tile hero-tile--static">
                  <Text fw={700} size="sm">
                    {item.label}
                  </Text>
                  <Text size="xs" c="dimmed" mt={6} lh={1.45}>
                    {item.description}
                  </Text>
                </div>
              ),
            )}
          </div>
        </div>
      </Stack>
    </PageContainer>
  )
}
