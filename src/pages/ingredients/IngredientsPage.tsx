import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  useComputedColorScheme,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { AuctionPrice24hLine } from '../../components/auction-price-24h/AuctionPrice24hLine'
import { AuctionRefreshStatus } from '../../components/auction-refresh-status/AuctionRefreshStatus'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { collectHideoutItemIds } from '../../shared/lib/collectHideoutItemIds'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { useFavoritesStore } from '../../shared/store/favoritesStore'
import { useIngredientPricesStore } from '../../shared/store/ingredientPricesStore'
import { AdminAuctionTrackingButton } from '../../components/admin-auction-ignore/AdminAuctionTrackingButton'

function createEnergyIconSvg(fillColor: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54" fill="none">
      <path d="M30 8L16 30h10l-2 16 14-22H28l2-16z" fill="${fillColor}"/>
    </svg>`,
  )}`
}

export function IngredientsPage() {
  const colorScheme = useComputedColorScheme('dark')
  const { recipes, itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const favoriteItemIds = useFavoritesStore((state) => state.favoriteItemIds)
  const { buyPricesByItemId, setBuyPrice, loadRemoteBuyPrices, energyPrice, setEnergyPrice } =
    useIngredientPricesStore()
  const [draftEnergyPrice, setDraftEnergyPrice] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'base' | 'favorites'>('all')
  const [draftBuyPricesByItemId, setDraftBuyPricesByItemId] = useState<Record<string, string>>({})
  const energyIconSvg = createEnergyIconSvg(colorScheme === 'light' ? '#4b5563' : '#ffffff')

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    void loadRemoteBuyPrices()
  }, [loadRemoteBuyPrices])

  useEffect(() => {
    setDraftBuyPricesByItemId(buyPricesByItemId)
  }, [buyPricesByItemId])

  useEffect(() => {
    setDraftEnergyPrice(energyPrice)
  }, [energyPrice])

  const ingredients = useMemo(() => {
    const ingredientIds = new Set<string>()
    const craftableResultIds = new Set<string>()

    recipes.forEach((recipe) => {
      recipe.ingredients.forEach((entry) => {
        ingredientIds.add(entry.item)
      })
      recipe.result.forEach((entry) => {
        craftableResultIds.add(entry.item)
      })
    })

    return [...ingredientIds]
      .map((itemId) => {
        const item = itemsById[itemId]
        return {
          itemId,
          name: getItemName(item?.name?.lines) || itemId,
          iconUrl: item ? buildItemIconUrl(item.icon, realm) : undefined,
          qualityColor: item?.color,
          isBase: !craftableResultIds.has(itemId),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [itemsById, recipes, realm])

  const auctionItemIds = useMemo(() => collectHideoutItemIds(recipes), [recipes])

  const filteredIngredients = useMemo(() => {
    const query = search.trim().toLowerCase()

    return ingredients.filter((item) => {
      if (activeFilter === 'base' && !item.isBase) return false
      if (activeFilter === 'favorites' && !favoriteItemIds.includes(item.itemId)) return false
      if (!query) return true

      const haystack = `${item.name} ${item.itemId}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [activeFilter, favoriteItemIds, ingredients, search])

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md">
          <Text size="xl" fw={700}>
            Ингредиенты
          </Text>

          {!isLoading && !error ? <AuctionRefreshStatus itemIds={auctionItemIds} /> : null}

          {isLoading ? (
            <Stack gap="xs">
              <Loader size="sm" />
              <Text size="sm">Загрузка ингредиентов...</Text>
            </Stack>
          ) : null}

          {error ? (
            <Alert color="red" title="Ошибка загрузки">
              {error}
            </Alert>
          ) : null}

          {!isLoading && !error ? (
            <>
              <Stack gap="md" mb="lg" px={12} pt={10}>
                <Group align="flex-end" wrap="wrap">
                  <TextInput
                    placeholder="Поиск: название или ID ингредиента..."
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                    style={{ flex: 1, minWidth: 280 }}
                  />
                </Group>

                <Group justify="center" gap="xs" wrap="wrap">
                  <Button
                    variant={activeFilter === 'all' ? 'filled' : 'default'}
                    onClick={() => setActiveFilter('all')}
                    style={{
                      whiteSpace: 'normal',
                      height: 'auto',
                      textAlign: 'center',
                      fontSize: 15,
                      padding: '10px 16px',
                      borderRadius: 12,
                      lineHeight: 1.2,
                    }}
                  >
                    Все
                  </Button>
                  <Button
                    variant={activeFilter === 'base' ? 'filled' : 'default'}
                    onClick={() => setActiveFilter('base')}
                    style={{
                      whiteSpace: 'normal',
                      height: 'auto',
                      textAlign: 'center',
                      fontSize: 15,
                      padding: '10px 16px',
                      borderRadius: 12,
                      lineHeight: 1.2,
                    }}
                  >
                    Базовые ингредиенты
                  </Button>
                  <Button
                    variant={activeFilter === 'favorites' ? 'filled' : 'default'}
                    onClick={() => setActiveFilter('favorites')}
                    style={{
                      whiteSpace: 'normal',
                      height: 'auto',
                      textAlign: 'center',
                      fontSize: 15,
                      padding: '10px 16px',
                      borderRadius: 12,
                      lineHeight: 1.2,
                    }}
                  >
                    Избранное
                  </Button>
                </Group>
              </Stack>

              <Box mb="md" px={12}>
                <Stack
                  className="energy-ingredient-card"
                  gap={8}
                  p="md"
                  bd="1px solid var(--mantine-color-default-border)"
                  style={{ borderRadius: 8, width: '100%', maxWidth: 420 }}
                >
                  <ItemBadge
                    name="Энергия"
                    iconUrl={energyIconSvg}
                    qualityColor="DEFAULT"
                    size="result"
                    disableGlow
                  />
                  <Text size="xs" c="dimmed">
                    История выкупов по энергии в API не привязана к предмету.
                  </Text>
                  <Group wrap="nowrap" align="flex-end">
                    <TextInput
                      placeholder="Цена скупа за 1 ед."
                      value={draftEnergyPrice}
                      onChange={(event) =>
                        setDraftEnergyPrice(event.currentTarget.value.replace(/[^\d]/g, ''))
                      }
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="default"
                      color="gray"
                      onClick={() => setEnergyPrice(draftEnergyPrice.replace(/[^\d]/g, ''))}
                    >
                      Сохранить
                    </Button>
                  </Group>
                </Stack>
              </Box>

              <SimpleGrid
                cols={{ base: 1, sm: 2, md: 3, xl: 4 }}
                spacing="lg"
                verticalSpacing="lg"
                px={12}
                pb={16}
              >
                {filteredIngredients.map((item) => (
                  <Stack
                    key={item.itemId}
                    gap={8}
                    p="md"
                    bd="1px solid var(--mantine-color-default-border)"
                    style={{ borderRadius: 8 }}
                  >
                    <ItemBadge
                      itemId={item.itemId}
                      name={item.name}
                      iconUrl={item.iconUrl}
                      qualityColor={item.qualityColor}
                      size="result"
                    />
                    <AuctionPrice24hLine itemId={item.itemId} size="sm" />
                    <AdminAuctionTrackingButton itemId={item.itemId} itemName={item.name} />
                    <Group wrap="nowrap" align="flex-end">
                      <TextInput
                        placeholder="Цена скупа за 1 ед."
                        value={draftBuyPricesByItemId[item.itemId] ?? ''}
                        onChange={(event) => {
                          const raw = event.currentTarget.value
                          const sanitized = raw.replace(/[^\d]/g, '')
                          setDraftBuyPricesByItemId((state) => ({
                            ...state,
                            [item.itemId]: sanitized,
                          }))
                        }}
                        style={{ flex: 1 }}
                      />
                      <Button
                        variant="default"
                        color="gray"
                        onClick={() => {
                          const value = (draftBuyPricesByItemId[item.itemId] ?? '').replace(/[^\d]/g, '')
                          setBuyPrice(item.itemId, value)
                        }}
                      >
                        Сохранить
                      </Button>
                    </Group>
                  </Stack>
                ))}
              </SimpleGrid>
            </>
          ) : null}
        </Stack>
      </SectionCard>
    </PageContainer>
  )
}
