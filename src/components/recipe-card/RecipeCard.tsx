import { ActionIcon, Button, Group, Stack, Text, useComputedColorScheme } from '@mantine/core'
import { useState } from 'react'
import { AuctionPrice24hLine } from '../auction-price-24h/AuctionPrice24hLine'
import { ItemBadge } from '../item-badge/ItemBadge'
import type { HideoutRecipe } from '../../entities/hideout/types'
import type { ListingItemWithId } from '../../entities/item/types'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import type { Realm } from '../../shared/config/app'
import { getLocalizedLine } from '../../shared/lib/getLocalizedLine'
import { useFavoritesStore } from '../../shared/store/favoritesStore'

function createEnergyIconSvg(fillColor: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54" fill="none">
      <path d="M30 8L16 30h10l-2 16 14-22H28l2-16z" fill="${fillColor}"/>
    </svg>`,
  )}`
}

type RecipeCardProps = {
  recipe: HideoutRecipe
  itemsById: Record<string, ListingItemWithId>
  realm: Realm
  recipeFavoriteId?: string
  hideRecipeTitle?: boolean
  hideResultSection?: boolean
  showResultTextOnly?: boolean
  showCraftToggle?: boolean
  defaultCraftOpen?: boolean
}

function getItemPresentation(
  itemId: string,
  itemsById: Record<string, ListingItemWithId>,
  realm: Realm,
) {
  const item = itemsById[itemId]
  return {
    itemId,
    name: getItemName(item?.name?.lines) || itemId,
    iconUrl: item ? buildItemIconUrl(item.icon, realm) : undefined,
    qualityColor: item?.color,
  }
}

export function RecipeCard({
  recipe,
  itemsById,
  realm,
  recipeFavoriteId,
  hideRecipeTitle = false,
  hideResultSection = false,
  showResultTextOnly = false,
  showCraftToggle = true,
  defaultCraftOpen = false,
}: RecipeCardProps) {
  const { isFavoriteCraft, toggleFavoriteCraft } = useFavoritesStore()
  const colorScheme = useComputedColorScheme('dark')
  const primaryResultItemId = recipe.result[0]?.item
  const [isCraftOpen, setIsCraftOpen] = useState(defaultCraftOpen)
  const energyIconSvg = createEnergyIconSvg(colorScheme === 'light' ? '#4b5563' : '#ffffff')

  const resultItems = recipe.result.map((entry) => {
    const view = getItemPresentation(entry.item, itemsById, realm)
    return { ...entry, ...view }
  })

  const ingredientItems = recipe.ingredients.map((entry) => {
    const view = getItemPresentation(entry.item, itemsById, realm)
    return { ...entry, ...view }
  })

  return (
    <Stack
      gap="sm"
      p="md"
      bd="1px solid var(--mantine-color-default-border)"
      style={{ borderRadius: 8, position: 'relative' }}
    >
      {recipeFavoriteId && primaryResultItemId ? (
        <ActionIcon
          size={36}
          variant="subtle"
          color={isFavoriteCraft(recipeFavoriteId) ? 'yellow' : 'gray'}
          onClick={(event) => {
            event.stopPropagation()
            toggleFavoriteCraft(recipeFavoriteId)
          }}
          style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}
          aria-label="Добавить крафт в избранное"
        >
          {isFavoriteCraft(recipeFavoriteId) ? '★' : '☆'}
        </ActionIcon>
      ) : null}

      {!hideRecipeTitle ? (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
              {getLocalizedLine(recipe.category.lines)}
              {recipe.subcategory?.lines ? ` / ${getLocalizedLine(recipe.subcategory.lines)}` : ''}
            </Text>
          </Stack>
        </Group>
      ) : null}

      {!hideResultSection ? (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Результат
          </Text>
          {resultItems.map((item) => (
            <Stack key={`result-${item.item}`} gap={4}>
              <ItemBadge
                itemId={item.itemId}
                showFavoriteButton={false}
                name={item.name}
                iconUrl={item.iconUrl}
                amount={item.amount}
                qualityColor={item.qualityColor}
                size="result"
              />
              <AuctionPrice24hLine itemId={item.itemId} />
            </Stack>
          ))}
        </Stack>
      ) : showResultTextOnly ? (
        <Stack gap={4}>
          {resultItems.map((item) => (
            <Text key={`result-text-${item.item}`} size="sm" fw={600}>
              {item.name} x{item.amount}
            </Text>
          ))}
        </Stack>
      ) : null}

      {showCraftToggle ? (
        <Button variant="light" size="xs" onClick={() => setIsCraftOpen((prev) => !prev)}>
          {isCraftOpen ? 'Скрыть крафт' : 'Показать крафт'}
        </Button>
      ) : null}

      {isCraftOpen || !showCraftToggle ? (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Ингредиенты
          </Text>
          <Stack gap="xs">
            {ingredientItems.map((item) => (
              <Stack key={`ingredient-${item.item}`} gap={4}>
                <ItemBadge
                  itemId={item.itemId}
                  showFavoriteButton={false}
                  name={item.name}
                  iconUrl={item.iconUrl}
                  amount={item.amount}
                  qualityColor={item.qualityColor}
                  size="ingredient"
                />
                <AuctionPrice24hLine itemId={item.itemId} />
              </Stack>
            ))}
            <ItemBadge
              name="Энергия"
              amount={recipe.energy}
              iconUrl={energyIconSvg}
              qualityColor="DEFAULT"
              size="ingredient"
              disableGlow
            />
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  )
}
