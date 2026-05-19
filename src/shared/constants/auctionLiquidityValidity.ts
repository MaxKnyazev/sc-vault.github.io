export type AuctionLiquidityTier =
  | 'invalid'
  | 'below_average'
  | 'average'
  | 'above_average'
  | 'reliable'

export type AuctionLiquidityLabel = {
  short: string
  tooltip: string
}

export const AUCTION_LIQUIDITY_LABELS: Record<AuctionLiquidityTier, AuctionLiquidityLabel> = {
  invalid: {
    short: 'Нет ликвидности',
    tooltip: '0 сделок за окно или предмет не в глобальном отслеживании',
  },
  below_average: {
    short: 'Слабая активность',
    tooltip: 'Заметно меньше продаж, чем у типичного отслеживаемого предмета',
  },
  average: {
    short: 'Нормальная активность',
    tooltip: 'Около медианы по отслеживаемым предметам',
  },
  above_average: {
    short: 'Высокая активность',
    tooltip: 'Заметно больше медианы по отслеживаемым',
  },
  reliable: {
    short: 'Надёжная выборка',
    tooltip: 'Много продаж; цене аукциона можно доверять',
  },
}

export const AUCTION_LIQUIDITY_BADGE_COLOR: Record<AuctionLiquidityTier, string> = {
  invalid: 'gray',
  below_average: 'orange',
  average: 'yellow',
  above_average: 'cyan',
  reliable: 'green',
}
