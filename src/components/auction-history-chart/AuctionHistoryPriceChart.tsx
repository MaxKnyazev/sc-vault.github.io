import { memo, useCallback, useMemo, type WheelEvent } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import { Text } from '@mantine/core'
import type {
  AuctionHistoryPoint,
  AuctionHistoryRange,
  AuctionHistoryZoom,
} from '../../shared/api/backendApi'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import {
  buildAuctionHistoryChartRows,
  getChartTickTargets,
  getPriceExtents,
  type AuctionHistoryChartRow,
} from './auctionHistoryChartData'
import { formatHistoryAxisLabel, formatHistoryTooltipTime } from './auctionHistoryChartFormat'
import './auction-history-chart.scss'

const QTY_FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

type AuctionHistoryPriceChartProps = {
  points: AuctionHistoryPoint[]
  range: AuctionHistoryRange
  zoom: AuctionHistoryZoom
  timezoneOffsetHours: number
  zoomLevels: AuctionHistoryZoom[]
  onZoomChange: (zoom: AuctionHistoryZoom) => void
}

type TooltipPayload = {
  payload: AuctionHistoryChartRow
}

function ChartTooltipContent({
  active,
  payload,
  timezoneOffsetHours,
}: TooltipProps<number, string> & { timezoneOffsetHours: number }) {
  if (!active || !payload?.length) return null
  const row = (payload[0] as TooltipPayload | undefined)?.payload
  if (!row) return null

  return (
    <div className="auction-history-chart-tooltip">
      <div className="auction-history-chart-tooltip__title">
        {formatHistoryTooltipTime(row.ts, timezoneOffsetHours)}
      </div>
      <div className="auction-history-chart-tooltip__row">
        Средняя цена: {formatAuctionRub(row.price)} ₽
      </div>
      <div className="auction-history-chart-tooltip__row">Сделок: {row.tradeCount}</div>
      <div className="auction-history-chart-tooltip__row">Объём: {QTY_FORMAT.format(row.totalQty)} шт.</div>
      <div className="auction-history-chart-tooltip__row">
        Выручка: {formatAuctionRub(row.totalRevenue)} ₽
      </div>
    </div>
  )
}

export const AuctionHistoryPriceChart = memo(function AuctionHistoryPriceChart({
  points,
  range,
  zoom,
  timezoneOffsetHours,
  zoomLevels,
  onZoomChange,
}: AuctionHistoryPriceChartProps) {
  const rows = useMemo(() => buildAuctionHistoryChartRows(points), [points])
  const { min, max } = useMemo(() => getPriceExtents(rows), [rows])
  const tickTargets = useMemo(() => getChartTickTargets(zoom), [zoom])

  const yDomain = useMemo((): [number, number] => {
    if (rows.length === 0) return [0, 1]
    if (min === max) {
      const pad = Math.max(min * 0.05, 1)
      return [Math.max(0, min - pad), max + pad]
    }
    const pad = (max - min) * 0.06
    return [Math.max(0, min - pad), max + pad]
  }, [rows.length, min, max])

  const formatYTick = useCallback((value: number) => `${formatAuctionRub(value)} ₽`, [])
  const formatXTick = useCallback(
    (ts: string) => formatHistoryAxisLabel(ts, range, timezoneOffsetHours),
    [range, timezoneOffsetHours],
  )

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      e.preventDefault()
      const direction = e.deltaY < 0 ? 1 : -1
      const idx = zoomLevels.indexOf(zoom)
      const nextIdx =
        direction > 0 ? Math.min(zoomLevels.length - 1, idx + 1) : Math.max(0, idx - 1)
      const nextZoom = zoomLevels[nextIdx] ?? zoom
      if (nextZoom !== zoom) onZoomChange(nextZoom)
    },
    [onZoomChange, zoom, zoomLevels],
  )

  if (rows.length === 0) {
    return (
      <div className="auction-history-chart">
        <div className="auction-history-chart__empty">
          <Text size="sm" c="dimmed">
            Недостаточно точек для графика.
          </Text>
        </div>
      </div>
    )
  }

  return (
    <div className="auction-history-chart">
      <div className="auction-history-chart__plot" onWheel={handleWheel}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
            <defs>
              <linearGradient id="auctionHistoryPriceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="ts"
              tickFormatter={formatXTick}
              tickCount={tickTargets.x}
              minTickGap={28}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tickFormatter={formatYTick}
              tickCount={tickTargets.y}
              domain={yDomain}
              width={88}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<ChartTooltipContent timezoneOffsetHours={timezoneOffsetHours} />}
              cursor={{ strokeDasharray: '4 4' }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              strokeWidth={2.25}
              fill="url(#auctionHistoryPriceFill)"
              dot={false}
              activeDot={{ r: 5, stroke: 'var(--mantine-color-body)', strokeWidth: 2, fill: '#3b82f6' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="auction-history-chart__footer">
        <Text size="xs" c="dimmed">
          min: {formatAuctionRub(min)} ₽
        </Text>
        <Text size="xs" c="dimmed">
          max: {formatAuctionRub(max)} ₽
        </Text>
      </div>
    </div>
  )
})
