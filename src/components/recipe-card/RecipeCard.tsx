import { ActionIcon, Group, Stack, Text, useComputedColorScheme } from '@mantine/core'
import { ItemBadge } from '../item-badge/ItemBadge'
import type { HideoutRecipe } from '../../entities/hideout/types'
import type { ListingItemWithId } from '../../entities/item/types'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import type { Realm } from '../../shared/config/app'
import { getLocalizedLine } from '../../shared/lib/getLocalizedLine'
import { useFavoritesStore } from '../../shared/store/favoritesStore'
import { calculateLevelBonus } from '../../entities/hideout/bonus'

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

export function RecipeCard({ recipe, itemsById, realm }: RecipeCardProps) {
  const { isFavorite, toggleFavorite } = useFavoritesStore()
  const colorScheme = useComputedColorScheme('dark')
  const primaryResultItemId = recipe.result[0]?.item
  const bonus = calculateLevelBonus(recipe)
  const energyIconSvg = createEnergyIconSvg(colorScheme === 'light' ? '#4b5563' : '#ffffff')

  const resultItems = recipe.result.map((entry) => {
    const view = getItemPresentation(entry.item, itemsById, realm)
    return { ...entry, ...view }
  })

  const resultItemsWithBonus = recipe.result.map((entry) => {
    const view = getItemPresentation(entry.item, itemsById, realm)
    return {
      ...entry,
      ...view,
      amountWithBonus: Number((entry.amount + bonus.expectedBonusUnits).toFixed(2)),
    }
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
      {primaryResultItemId ? (
        <ActionIcon
          size={36}
          variant="subtle"
          color={isFavorite(primaryResultItemId) ? 'yellow' : 'gray'}
          onClick={(event) => {
            event.stopPropagation()
            toggleFavorite(primaryResultItemId)
          }}
          style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}
          aria-label="Добавить крафт в избранное"
        >
          {isFavorite(primaryResultItemId) ? '★' : '☆'}
        </ActionIcon>
      ) : null}

      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
            {getLocalizedLine(recipe.category.lines)}
            {recipe.subcategory?.lines ? ` / ${getLocalizedLine(recipe.subcategory.lines)}` : ''}
          </Text>
        </Stack>
      </Group>

      <Stack gap={6}>
        <Text size="xs" c="dimmed">
          Результат
        </Text>
        {resultItems.map((item) => (
          <ItemBadge
            key={`result-${item.item}`}
            itemId={item.itemId}
            showFavoriteButton={false}
            name={item.name}
            iconUrl={item.iconUrl}
            amount={item.amount}
            qualityColor={item.qualityColor}
            size="result"
          />
        ))}
      </Stack>

      <Stack gap={6}>
        <Text size="xs" c="dimmed">
          Итог с бонусом
        </Text>
        <Text size="xs" c="dimmed">
          {(bonus.playerLevel - bonus.requiredLevel)} x {bonus.craftBoostFactor} = {bonus.bonusPercent}%
        </Text>
        <Text size="xs" c="dimmed">
          +{bonus.guaranteedBonusUnits} гарантировано, +{bonus.extraBonusChancePercent}% шанс еще +1
        </Text>
        {resultItemsWithBonus.map((item) => (
          <ItemBadge
            key={`result-bonus-${item.item}`}
            itemId={item.itemId}
            showFavoriteButton={false}
            name={item.name}
            iconUrl={item.iconUrl}
            amount={item.amountWithBonus}
            qualityColor={item.qualityColor}
            size="result"
          />
        ))}
      </Stack>

      <Stack gap={6}>
        <Text size="xs" c="dimmed">
          Ингредиенты
        </Text>
        <Stack gap="xs">
          {ingredientItems.map((item) => (
            <ItemBadge
              key={`ingredient-${item.item}`}
              itemId={item.itemId}
              showFavoriteButton={false}
              name={item.name}
              iconUrl={item.iconUrl}
              amount={item.amount}
              qualityColor={item.qualityColor}
              size="ingredient"
            />
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
    </Stack>
  )
}
