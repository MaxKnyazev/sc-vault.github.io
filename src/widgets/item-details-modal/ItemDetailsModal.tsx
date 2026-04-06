import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { RecipeCard } from '../../components/recipe-card/RecipeCard'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { useItemDetailsModalStore } from '../../shared/store/itemDetailsModalStore'
import { useAuctionPricesStore } from '../../shared/store/auctionPricesStore'
import { useIngredientPricesStore } from '../../shared/store/ingredientPricesStore'
import { getQualityModalGlowBoxShadow } from '../../shared/lib/getQualityGlowColor'

export function ItemDetailsModal() {
  const { opened, itemId, close } = useItemDetailsModalStore()
  const { itemsById, recipes, realm } = useHideoutStore()
  const stat = useAuctionPricesStore((s) => (itemId ? s.byItemId[itemId] : undefined))
  const buyPrice = useIngredientPricesStore((s) => (itemId ? s.buyPricesByItemId[itemId] ?? '' : ''))
  const setBuyPrice = useIngredientPricesStore((s) => s.setBuyPrice)

  const item = itemId ? itemsById[itemId] : undefined
  const itemName = getItemName(item?.name?.lines)
  const [draftBuyPrice, setDraftBuyPrice] = useState('')
  const [showCrafts, setShowCrafts] = useState(false)

  const craftRecipes = useMemo(() => {
    if (!itemId) return []
    return recipes.filter((recipe) => recipe.result.some((entry) => entry.item === itemId))
  }, [itemId, recipes])

  const iconUrl = item ? buildItemIconUrl(item.icon, realm) : undefined
  const qualityForGlow = item?.color
  const modalGlow = useMemo(() => getQualityModalGlowBoxShadow(qualityForGlow), [qualityForGlow])

  useEffect(() => {
    setDraftBuyPrice(buyPrice)
  }, [buyPrice, itemId, opened])

  useEffect(() => {
    if (!opened) setShowCrafts(false)
  }, [opened, itemId])

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={itemName || 'Информация о предмете'}
      centered
      size="lg"
      lockScroll={false}
      styles={{
        content: {
          boxShadow: modalGlow,
        },
      }}
    >
      <Stack gap="sm">
        {itemId ? (
          <>
            <ItemBadge
              itemId={itemId}
              name={itemName || itemId}
              iconUrl={iconUrl}
              qualityColor={item?.color}
              size="result"
            />

            {stat ? (
              stat.avgPerUnit !== null ? (
                <Text size="sm" c="dimmed">
                  Средняя цена аукциона (12ч): {formatAuctionRub(stat.avgPerUnit)} ₽/шт
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  Средняя цена аукциона (12ч): нет сделок
                </Text>
              )
            ) : null}

            <Stack gap={6}>
              <Text size="sm" c="dimmed">
                Цена скупа
              </Text>
              <Group wrap="nowrap" align="flex-end">
                <TextInput
                  placeholder="Цена скупа за 1 ед."
                  value={draftBuyPrice}
                  onChange={(event) => setDraftBuyPrice(event.currentTarget.value.replace(/[^\d]/g, ''))}
                  style={{ flex: 1 }}
                />
                <Button
                  variant="default"
                  color="gray"
                  onClick={() => {
                    if (!itemId) return
                    setBuyPrice(itemId, draftBuyPrice.replace(/[^\d]/g, ''))
                  }}
                >
                  Сохранить
                </Button>
              </Group>
            </Stack>

            {craftRecipes.length > 0 ? (
              <>
                <Button variant="light" size="xs" onClick={() => setShowCrafts((s) => !s)}>
                  {showCrafts ? `Скрыть крафты (${craftRecipes.length})` : `Показать крафты (${craftRecipes.length})`}
                </Button>
                {showCrafts ? (
                  <Stack gap="sm">
                    {craftRecipes.map((recipe, index) => (
                      <RecipeCard
                        key={`${recipe.bench}-${index}`}
                        recipe={recipe}
                        itemsById={itemsById}
                        realm={realm}
                        hideResultSection
                        showResultTextOnly
                        showCraftToggle={false}
                        defaultCraftOpen
                      />
                    ))}
                  </Stack>
                ) : null}
              </>
            ) : (
              <Text size="sm" c="dimmed">
                Этот предмет не крафтится.
              </Text>
            )}
          </>
        ) : null}
      </Stack>
    </Modal>
  )
}
