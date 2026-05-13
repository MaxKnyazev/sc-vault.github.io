import { Alert, Avatar, Button, Checkbox, Group, NumberInput, Select, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { useAuthStore } from '../../shared/store/authStore'
import { getRoleLabel } from '../../shared/lib/authRole'
import type { AuctionHybridSettings, CraftBranchLevels } from '../../shared/api/backendApi'
import { normalizeAuctionHybridSettings } from '../../shared/api/backendApi'

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

const HYBRID_LAST_SALES: Array<AuctionHybridSettings['lastSalesCount']> = [50, 100, 200, 500, 1000]
const HYBRID_WINDOWS: Array<AuctionHybridSettings['timeWindow']> = ['1h', '6h', '12h', '24h']

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
  const [auctionHybridSettings, setAuctionHybridSettings] = useState<AuctionHybridSettings>(() =>
    normalizeAuctionHybridSettings(user?.auctionHybridSettings),
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
    setAuctionHybridSettings(normalizeAuctionHybridSettings(user.auctionHybridSettings))
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
                  auctionHybridSettings,
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
          <Text fw={600} size="sm">
            Гибридная оценка (скуп + аукцион + крафт)
          </Text>
          <Text size="xs" c="dimmed">
            Если за выбранное окно сделок данных мало, на сервере выборка расширяется до следующего порога; на странице
            крафтов показывается пояснение.
          </Text>
          <Select
            label="Режим цены аукциона для гибрида"
            value={auctionHybridSettings.mode}
            data={[
              { value: 'last_sales', label: 'Последние N продаж (сырые сделки)' },
              { value: 'time_window', label: 'Средняя за период (агрегат auction_stats)' },
            ]}
            onChange={(v) =>
              setAuctionHybridSettings((prev) =>
                normalizeAuctionHybridSettings({ ...prev, mode: v === 'time_window' ? 'time_window' : 'last_sales' }),
              )
            }
          />
          <NumberInput
            label="Минимум сделок в окне"
            description="Если сделок меньше — сервер расширит окно до следующего порога."
            min={1}
            max={200}
            value={auctionHybridSettings.minTrades}
            onChange={(value) => {
              const raw = typeof value === 'number' ? value : Number(value || 1)
              const n = Math.min(200, Math.max(1, Number.isFinite(raw) ? Math.round(raw) : 1))
              setAuctionHybridSettings((prev) => normalizeAuctionHybridSettings({ ...prev, minTrades: n }))
            }}
          />
          {auctionHybridSettings.mode === 'last_sales' ? (
            <Select
              label="Сколько последних продаж запрашивать (стартовое окно)"
              value={String(auctionHybridSettings.lastSalesCount)}
              data={HYBRID_LAST_SALES.map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(v) => {
                const n = Number(v)
                if (!HYBRID_LAST_SALES.includes(n as AuctionHybridSettings['lastSalesCount'])) return
                setAuctionHybridSettings((prev) =>
                  normalizeAuctionHybridSettings({
                    ...prev,
                    lastSalesCount: n as AuctionHybridSettings['lastSalesCount'],
                  }),
                )
              }}
            />
          ) : (
            <Select
              label="Стартовое окно времени для агрегата"
              value={auctionHybridSettings.timeWindow}
              data={HYBRID_WINDOWS.map((w) => ({ value: w, label: w }))}
              onChange={(v) => {
                if (!v || !HYBRID_WINDOWS.includes(v as AuctionHybridSettings['timeWindow'])) return
                setAuctionHybridSettings((prev) =>
                  normalizeAuctionHybridSettings({ ...prev, timeWindow: v as AuctionHybridSettings['timeWindow'] }),
                )
              }}
            />
          )}
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

