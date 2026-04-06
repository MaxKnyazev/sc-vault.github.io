import { ActionIcon, Box, Button, Group, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { RecipeCard } from '../../components/recipe-card/RecipeCard'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { getRecipeFavoriteId } from '../../shared/lib/getRecipeFavoriteId'
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
  const [showUsedInCrafts, setShowUsedInCrafts] = useState(false)

  const craftRecipes = useMemo(() => {
    if (!itemId) return []
    return recipes.filter((recipe) => recipe.result.some((entry) => entry.item === itemId))
  }, [itemId, recipes])
  const usedInRecipes = useMemo(() => {
    if (!itemId) return []
    return recipes.filter((recipe) => recipe.ingredients.some((entry) => entry.item === itemId))
  }, [itemId, recipes])

  const iconUrl = item ? buildItemIconUrl(item.icon, realm) : undefined
  const qualityForGlow = item?.color
  const modalGlow = useMemo(() => getQualityModalGlowBoxShadow(qualityForGlow), [qualityForGlow])

  useEffect(() => {
    setDraftBuyPrice(buyPrice)
  }, [buyPrice, itemId, opened])

  useEffect(() => {
    if (!opened) {
      setShowCrafts(false)
      setShowUsedInCrafts(false)
    }
  }, [opened, itemId])

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={null}
      withCloseButton={false}
      centered
      size="lg"
      lockScroll
      removeScrollProps={{
        removeScrollBar: false,
      }}
      styles={{
        content: {
          boxShadow: modalGlow,
          overflow: 'visible',
        },
      }}
    >
      <ScrollArea.Autosize mah="calc(100vh - 140px)" className="item-details-modal-body">
        <Stack gap="sm">
          {itemId ? (
            <>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Box style={{ flex: 1, minWidth: 0 }}>
                <ItemBadge
                  itemId={itemId}
                  name={itemName || itemId}
                  iconUrl={iconUrl}
                  qualityColor={item?.color}
                  size="result"
                />
              </Box>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                onClick={close}
                aria-label="Закрыть"
                style={{ marginTop: 2, marginLeft: 4 }}
              >
                ✕
              </ActionIcon>
            </Group>

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
                        recipeFavoriteId={getRecipeFavoriteId(recipe)}
                        hideRecipeTitle
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

            {usedInRecipes.length > 0 ? (
              <>
                <Button variant="light" size="xs" onClick={() => setShowUsedInCrafts((s) => !s)}>
                  {showUsedInCrafts
                    ? `Скрыть "Для чего используется" (${usedInRecipes.length})`
                    : `Для чего используется (${usedInRecipes.length})`}
                </Button>
                {showUsedInCrafts ? (
                  <Stack gap="sm">
                    {usedInRecipes.map((recipe, index) => (
                      <Stack
                        key={`used-in-${recipe.bench}-${index}`}
                        gap={6}
                        p="md"
                        bd="1px solid var(--mantine-color-default-border)"
                        style={{ borderRadius: 8 }}
                      >
                        <Text size="xs" c="dimmed">
                          Результат крафта
                        </Text>
                        {recipe.result.map((entry) => {
                          const resultItem = itemsById[entry.item]
                          return (
                            <ItemBadge
                              key={`used-in-result-${entry.item}-${entry.amount}`}
                              itemId={entry.item}
                              name={getItemName(resultItem?.name?.lines) || entry.item}
                              iconUrl={resultItem ? buildItemIconUrl(resultItem.icon, realm) : undefined}
                              qualityColor={resultItem?.color}
                              amount={entry.amount}
                              size="ingredient"
                              showFavoriteButton={false}
                            />
                          )
                        })}
                      </Stack>
                    ))}
                  </Stack>
                ) : null}
              </>
            ) : (
              <Text size="sm" c="dimmed">
                Этот предмет не используется в других крафтах.
              </Text>
            )}
            </>
          ) : null}
        </Stack>
      </ScrollArea.Autosize>
    </Modal>
  )
}
