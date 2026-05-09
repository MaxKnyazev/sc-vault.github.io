/** Подписи редкости аукциона для UI/уведомлений (ключи API в нижнем регистре). */
export const AUCTION_QUALITY_LABEL_RU: Record<string, string> = {
  all: 'Все',
  normal: 'Обычная',
  uncommon: 'Необычная',
  special: 'Особая',
  rare: 'Редкая',
  exclusive: 'Исключительная',
  legendary: 'Легендарная',
  unique: 'Уникальная',
  unknown: 'Неизвестно',
}

export function auctionQualityLabelRu(quality: string): string {
  const k = quality.trim().toLowerCase()
  return AUCTION_QUALITY_LABEL_RU[k] ?? quality
}
