import { ActionIcon, Box, Group, Text } from '@mantine/core'
import { useFavoritesStore } from '../../shared/store/favoritesStore'

type ItemBadgeProps = {
  itemId?: string
  name: string
  iconUrl?: string
  amount?: number
  qualityColor?: string
  size?: 'result' | 'ingredient'
  disableGlow?: boolean
}

function getGlowByQuality(qualityColor?: string): string {
  switch (qualityColor) {
    case 'RANK_NEWBIE':
      return '#3fbf4f'
    case 'RANK_STALKER':
      return '#3b82f6'
    case 'RANK_VETERAN':
      return '#ec4899'
    case 'RANK_MASTER':
      return '#ef4444'
    case 'DEFAULT':
    case 'RANK_LOCKPICK':
    default:
      return '#ffffff'
  }
}

export function ItemBadge({
  itemId,
  name,
  iconUrl,
  amount,
  qualityColor,
  size = 'ingredient',
  disableGlow = false,
}: ItemBadgeProps) {
  const { isFavorite, toggleFavorite } = useFavoritesStore()
  const glowColor = getGlowByQuality(qualityColor)
  const iconBoxSize = size === 'result' ? 48 : 36
  const imageSize = size === 'result' ? 38 : 28
  const iconPadding = size === 'result' ? 6 : 4
  const glow = disableGlow
    ? 'none'
    : size === 'result'
      ? `0 0 12px 2px ${glowColor}66`
      : `0 0 10px 1px ${glowColor}55`
  const fontSize = size === 'result' ? 19 : 14
  const fontWeight = size === 'result' ? 700 : 500
  const favoriteButtonSize = size === 'result' ? 24 : 20

  return (
    <Box style={{ position: 'relative', width: '100%', paddingRight: itemId ? 22 : 0 }}>
      {itemId ? (
        <ActionIcon
          size={favoriteButtonSize}
          variant="subtle"
          color={isFavorite(itemId) ? 'yellow' : 'gray'}
          onClick={() => toggleFavorite(itemId)}
          style={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}
          aria-label="Добавить в избранное"
        >
          {isFavorite(itemId) ? '★' : '☆'}
        </ActionIcon>
      ) : null}

      <Group gap="xs" wrap="nowrap" align="center">
        <Box
          w={iconBoxSize}
          h={iconBoxSize}
          p={iconPadding}
          style={{
            borderRadius: 12,
            flex: `0 0 ${iconBoxSize}px`,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(255,255,255,0.03)',
            boxShadow: glow,
          }}
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={name}
              width={imageSize}
              height={imageSize}
              style={{ objectFit: 'contain', display: 'block' }}
            />
          ) : null}
        </Box>
        <Text
          style={{
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            lineHeight: 1.15,
            fontSize,
            fontWeight,
          }}
        >
          {name}
          {typeof amount === 'number' ? ` x${amount}` : ''}
        </Text>
      </Group>
    </Box>
  )
}
