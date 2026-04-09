import { Avatar, Button, Group, Stack, Text } from '@mantine/core'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { useAuthStore } from '../../shared/store/authStore'
import { getRoleLabel } from '../../shared/lib/authRole'

export function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const isSubmitting = useAuthStore((s) => s.isSubmitting)
  const roleGlowColor =
    user?.role === 'admin' ? '#ef4444' : user?.role === 'user' ? '#3b82f6' : '#ffffff'

  if (!user) return null

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md">
          <Text size="xl" fw={700}>
            Личный кабинет
          </Text>
          <Group wrap="nowrap">
            <Avatar
              radius="xl"
              size={48}
              src={user.avatarUrl ?? undefined}
              name={user.nickname}
              color="gray"
              style={{
                backgroundColor: 'rgba(0,0,0,0.28)',
                border: `1px solid ${roleGlowColor}`,
                boxShadow: `0 0 10px ${roleGlowColor}`,
              }}
            />
            <Stack gap={2}>
              <Text fw={700} size="lg">
                {user.nickname}
              </Text>
              <Text size="sm" c="dimmed">
                {getRoleLabel(user.role)}
              </Text>
            </Stack>
          </Group>

          <Group justify="flex-end">
            <Button loading={isSubmitting} variant="default" color="gray" onClick={() => void logout()}>
              Выйти
            </Button>
          </Group>
        </Stack>
      </SectionCard>
    </PageContainer>
  )
}

