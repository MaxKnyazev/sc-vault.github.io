import { NumberInput, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import type { AuctionHybridSettings } from '../../shared/api/backendApi'
import { normalizeAuctionHybridSettings } from '../../shared/api/backendApi'
import {
  HYBRID_LAST_SALES_OPTIONS,
  HYBRID_TIME_WINDOW_OPTIONS,
} from '../../shared/constants/auctionHybridSettings'

type Props = {
  value: AuctionHybridSettings
  onChange: (next: AuctionHybridSettings) => void
  disabled?: boolean
}

export function AuctionHybridSettingsFormFields({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<AuctionHybridSettings>) => {
    onChange(normalizeAuctionHybridSettings({ ...value, ...patch }))
  }

  return (
    <Stack gap="md">
      <Stack gap={6}>
        <Text size="sm" fw={600}>
          Источник цены аукциона
        </Text>
        <SegmentedControl
          fullWidth
          disabled={disabled}
          value={value.mode}
          onChange={(v) => set({ mode: v === 'time_window' ? 'time_window' : 'last_sales' })}
          data={[
            { value: 'last_sales', label: 'Последние продажи' },
            { value: 'time_window', label: 'Средняя за период' },
          ]}
        />
        <Text size="xs" c="dimmed" lh={1.45}>
          {value.mode === 'last_sales'
            ? 'Средняя по сырым сделкам с аукциона. Стартовое окно — число последних продаж.'
            : 'Средняя из агрегата auction_stats за выбранный интервал времени.'}
        </Text>
      </Stack>

      <NumberInput
        label="Минимум сделок в окне"
        description="Если сделок меньше — сервер автоматически расширит окно до следующего порога."
        min={1}
        max={200}
        allowDecimal={false}
        disabled={disabled}
        value={value.minTrades}
        onChange={(raw) => {
          const n = typeof raw === 'number' ? raw : Number(raw || 1)
          set({ minTrades: Math.min(200, Math.max(1, Number.isFinite(n) ? Math.round(n) : 1)) })
        }}
      />

      {value.mode === 'last_sales' ? (
        <Select
          label="Стартовое окно"
          description="Сколько последних продаж запрашивать в первую очередь"
          disabled={disabled}
          value={String(value.lastSalesCount)}
          data={HYBRID_LAST_SALES_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          onChange={(v) => {
            const n = Number(v)
            const allowed = HYBRID_LAST_SALES_OPTIONS.map((o) => o.value)
            if (!allowed.includes(n as AuctionHybridSettings['lastSalesCount'])) return
            set({ lastSalesCount: n as AuctionHybridSettings['lastSalesCount'] })
          }}
        />
      ) : (
        <Select
          label="Стартовое окно"
          description="Интервал для агрегата auction_stats"
          disabled={disabled}
          value={value.timeWindow}
          data={HYBRID_TIME_WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => {
            const allowed = HYBRID_TIME_WINDOW_OPTIONS.map((o) => o.value)
            if (!v || !allowed.includes(v as AuctionHybridSettings['timeWindow'])) return
            set({ timeWindow: v as AuctionHybridSettings['timeWindow'] })
          }}
        />
      )}
    </Stack>
  )
}
