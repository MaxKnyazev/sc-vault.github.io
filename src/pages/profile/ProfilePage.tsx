import { Alert, Avatar, Button, Checkbox, Group, NumberInput, Select, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { useAuthStore } from '../../shared/store/authStore'
import { getRoleLabel } from '../../shared/lib/authRole'
import type { CraftBranchLevels } from '../../shared/api/backendApi'

const CRAFT_BRANCHES: Array<{ key: keyof CraftBranchLevels; label: string }> = [
  { key: 'ammo', label: 'Боеприпасы' },
  { key: 'pyrotechnics', label: 'Пиротехника' },
  { key: 'protectiveGear', label: 'Защитное снаряжение' },
  { key: 'engineering', label: 'Инженерия' },
  { key: 'cooking', label: 'Кулинария' },
  { key: 'moonshining', label: 'Самогоноварение' },
  { key: 'medicine', label: 'Медицина' },
  { key: 'rawMaterials', label: 'Сырье и материалы' },
]

export function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const isSubmitting = useAuthStore((s) => s.isSubmitting)
  const saveProfilePreferences = useAuthStore((s) => s.saveProfilePreferences)
  const authError = useAuthStore((s) => s.error)
  const [timezoneOffsetHours, setTimezoneOffsetHours] = useState<number>(user?.timezoneOffsetHours ?? 0)
  const [craftBranchLevels, setCraftBranchLevels] = useState<CraftBranchLevels>(
    user?.craftBranchLevels ?? {
      ammo: 1,
      pyrotechnics: 1,
      protectiveGear: 1,
      engineering: 1,
      cooking: 1,
      moonshining: 1,
      rawMaterials: 1,
      medicine: 1,
    },
  )
  const [auctionTrackingNotifications, setAuctionTrackingNotifications] = useState(
    user?.auctionTrackingNotifications !== false,
  )
  const roleGlowColor =
    user?.role === 'admin' ? '#ef4444' : user?.role === 'user' ? '#3b82f6' : '#ffffff'

  useEffect(() => {
    if (!user) return
    setTimezoneOffsetHours(user.timezoneOffsetHours)
    setCraftBranchLevels(user.craftBranchLevels)
    setAuctionTrackingNotifications(user.auctionTrackingNotifications !== false)
  }, [user])

  const timezoneOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = []
    for (let offset = -12; offset <= 14; offset += 1) {
      const sign = offset >= 0 ? '+' : '-'
      options.push({
        value: String(offset),
        label: `UTC${sign}${Math.abs(offset)}`,
      })
    }
    return options
  }, [])

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
            <Button
              loading={isSubmitting}
              onClick={() =>
                void saveProfilePreferences({
                  timezoneOffsetHours,
                  craftBranchLevels,
                  auctionTrackingNotifications,
                })
              }
            >
              Сохранить профиль
            </Button>
            <Button loading={isSubmitting} variant="default" color="gray" onClick={() => void logout()}>
              Выйти
            </Button>
          </Group>
          {authError ? <Alert color="red">{authError}</Alert> : null}
          <Select
            label="Часовой пояс (для отображения истории аукциона)"
            value={String(timezoneOffsetHours)}
            data={timezoneOptions}
            onChange={(value) => setTimezoneOffsetHours(value ? Number(value) : 0)}
          />
          <Checkbox
            label="Выводить уведомления об отслеживании аукциона"
            checked={auctionTrackingNotifications}
            onChange={(e) => setAuctionTrackingNotifications(e.currentTarget.checked)}
          />
          <Stack gap="xs">
            <Text fw={600}>Уровень веток крафта</Text>
            {CRAFT_BRANCHES.map((branch) => (
              <NumberInput
                key={branch.key}
                label={branch.label}
                min={1}
                max={5}
                allowDecimal={false}
                allowNegative={false}
                value={craftBranchLevels[branch.key]}
                onChange={(value) => {
                  const raw = typeof value === 'number' ? value : Number(value || 1)
                  const normalized = Math.min(5, Math.max(1, Number.isFinite(raw) ? Math.round(raw) : 1))
                  setCraftBranchLevels((prev) => ({ ...prev, [branch.key]: normalized }))
                }}
              />
            ))}
          </Stack>
        </Stack>
      </SectionCard>
    </PageContainer>
  )
}

