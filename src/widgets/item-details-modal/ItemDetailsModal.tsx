import { ActionIcon, Box, Button, Group, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { RecipeCard } from '../../components/recipe-card/RecipeCard'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { AuctionPrice24hLine } from '../../components/auction-price-24h/AuctionPrice24hLine'
import { AdminAuctionIgnoreButton } from '../../components/admin-auction-ignore/AdminAuctionIgnoreButton'
import { getRecipeFavoriteId } from '../../shared/lib/getRecipeFavoriteId'
import { useItemDetailsModalStore } from '../../shared/store/itemDetailsModalStore'
import { useIngredientPricesStore } from '../../shared/store/ingredientPricesStore'
import { getQualityModalGlowBoxShadow } from '../../shared/lib/getQualityGlowColor'
import { useRecipeOverridesStore } from '../../shared/store/recipeOverridesStore'
import { applyRecipeResultOverride } from '../../shared/lib/applyRecipeResultOverride'

export function ItemDetailsModal() {
  const { opened, itemId, close } = useItemDetailsModalStore()
  const { itemsById, recipes, realm } = useHideoutStore()
  const buyPrice = useIngredientPricesStore((s) => (itemId ? s.buyPricesByItemId[itemId] ?? '' : ''))
  const setBuyPrice = useIngredientPricesStore((s) => s.setBuyPrice)

  const item = itemId ? itemsById[itemId] : undefined
  const itemName = getItemName(item?.name?.lines)
  const [draftBuyPrice, setDraftBuyPrice] = useState<string | undefined>(undefined)
  const [showCrafts, setShowCrafts] = useState(false)
  const [showUsedInCrafts, setShowUsedInCrafts] = useState(false)
  const recipeOverridesById = useRecipeOverridesStore((s) => s.byRecipeId)
  const loadOverrides = useRecipeOverridesStore((s) => s.loadOverrides)

  useEffect(() => {
    void loadOverrides()
  }, [loadOverrides])

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

  const closeModal = () => {
    setShowCrafts(false)
    setShowUsedInCrafts(false)
    setDraftBuyPrice(undefined)
    close()
  }

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
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
                onClick={closeModal}
                aria-label="Закрыть"
                style={{ marginTop: 2, marginLeft: 4 }}
              >
                ✕
              </ActionIcon>
            </Group>

            <AuctionPrice24hLine itemId={itemId} size="sm" />
            <AdminAuctionIgnoreButton itemId={itemId} itemName={itemName || itemId} />

            <Stack gap={6}>
              <Text size="sm" c="dimmed">
                Цена скупа
              </Text>
              <Group wrap="nowrap" align="flex-end">
                <TextInput
                  placeholder="Цена скупа за 1 ед."
                  value={draftBuyPrice ?? buyPrice}
                  onChange={(event) =>
                    setDraftBuyPrice(event.currentTarget.value.replace(/[^\d]/g, ''))
                  }
                  style={{ flex: 1 }}
                />
                <Button
                  variant="default"
                  color="gray"
                  onClick={() => {
                    if (!itemId) return
                    const value = (draftBuyPrice ?? buyPrice).replace(/[^\d]/g, '')
                    setBuyPrice(itemId, value)
                    setDraftBuyPrice(value)
                  }}
                >
                  Сохранить
                </Button>
              </Group>
            </Stack>

            {craftRecipes.length > 0 ? (
              <>
                <Button variant="default" color="gray" size="xs" onClick={() => setShowCrafts((s) => !s)}>
                  {showCrafts ? `Скрыть крафты (${craftRecipes.length})` : `Показать крафты (${craftRecipes.length})`}
                </Button>
                {showCrafts ? (
                  <Stack gap="sm">
                    {craftRecipes.map((recipe, index) => (
                      <RecipeCard
                        key={`${recipe.bench}-${index}`}
                        recipe={applyRecipeResultOverride(recipe, recipeOverridesById)}
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
                <Button
                  variant="default"
                  color="gray"
                  size="xs"
                  onClick={() => setShowUsedInCrafts((s) => !s)}
                >
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
                        {applyRecipeResultOverride(recipe, recipeOverridesById).result.map((entry) => {
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
