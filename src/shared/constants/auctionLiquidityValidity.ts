export type AuctionLiquidityTier =
  | 'invalid'
  | 'below_average'
  | 'average'
  | 'above_average'
  | 'reliable'

export type AuctionLiquidityLabel = {
  short: string
  /** Короткая подпись для Badge в узких карточках */
  badge: string
  tooltip: string
}

export const AUCTION_LIQUIDITY_LABELS: Record<AuctionLiquidityTier, AuctionLiquidityLabel> = {
  invalid: {
    short: 'Нет ликвидности',
    badge: 'Нет ликв.',
    tooltip: '0 сделок за окно',
  },
  below_average: {
    short: 'Слабая активность',
    badge: 'Слабая',
    tooltip: 'Заметно меньше продаж, чем у типичного отслеживаемого предмета',
  },
  average: {
    short: 'Нормальная активность',
    badge: 'Норма',
    tooltip: 'Около медианы по отслеживаемым предметам',
  },
  above_average: {
    short: 'Высокая активность',
    badge: 'Высокая',
    tooltip: 'Заметно больше медианы по отслеживаемым',
  },
  reliable: {
    short: 'Надёжная выборка',
    badge: 'Надёжно',
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
