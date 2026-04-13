import { ActionIcon, Box, Group, Text } from '@mantine/core'
import { useFavoritesStore } from '../../shared/store/favoritesStore'
import { getQualityGlowColor } from '../../shared/lib/getQualityGlowColor'
import { useItemDetailsModalStore } from '../../shared/store/itemDetailsModalStore'

type ItemBadgeProps = {
  itemId?: string
  name: string
  iconUrl?: string
  amount?: number
  qualityColor?: string
  size?: 'result' | 'ingredient'
  disableGlow?: boolean
  showFavoriteButton?: boolean
}

export function ItemBadge({
  itemId,
  name,
  iconUrl,
  amount,
  qualityColor,
  size = 'ingredient',
  disableGlow = false,
  showFavoriteButton = true,
}: ItemBadgeProps) {
  const { isFavorite, toggleFavorite } = useFavoritesStore()
  const openItemModal = useItemDetailsModalStore((state) => state.open)
  const glowColor = getQualityGlowColor(qualityColor)
  const iconBoxSize = size === 'result' ? 58 : 43
  const imageSize = size === 'result' ? 46 : 34
  const iconPadding = size === 'result' ? 7 : 5
  const glow = disableGlow
    ? 'none'
    : size === 'result'
      ? `0 0 14px 2px ${glowColor}66`
      : `0 0 12px 1px ${glowColor}55`
  const fontSize = size === 'result' ? 19 : 14
  const fontWeight = size === 'result' ? 700 : 500
  const favoriteButtonSize = size === 'result' ? 29 : 24

  return (
    <Box
      style={{
        position: 'relative',
        width: '100%',
        paddingRight: itemId && showFavoriteButton ? 26 : 0,
      }}
    >
      {itemId && showFavoriteButton ? (
        <ActionIcon
          size={favoriteButtonSize}
          variant="subtle"
          color={isFavorite(itemId) ? 'yellow' : 'gray'}
          onClick={(event) => {
            event.stopPropagation()
            toggleFavorite(itemId)
          }}
          style={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}
          aria-label="Добавить в избранное"
        >
          {isFavorite(itemId) ? '★' : '☆'}
        </ActionIcon>
      ) : null}

      <Group
        gap="xs"
        wrap="nowrap"
        align="center"
        style={{ cursor: itemId ? 'pointer' : 'default' }}
        onClick={() => {
          if (itemId) openItemModal(itemId)
        }}
      >
        <Box
          w={iconBoxSize}
          h={iconBoxSize}
          p={iconPadding}
          style={{
            borderRadius: 9,
            border: `1px solid ${glowColor}`,
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
              style={{ objectFit: 'contain', objectPosition: 'center center', display: 'block' }}
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
