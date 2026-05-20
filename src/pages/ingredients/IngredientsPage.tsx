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
} from '@mantine/core'
import { memo, useEffect, useMemo, useState } from 'react'
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
import { useAuthStore } from '../../shared/store/authStore'
import { normalizeDecimalPriceForSubmit, sanitizeDecimalInput } from '../../shared/lib/sanitizeDecimalInput'

function createEnergyIconSvg(fillColor: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54" fill="none">
      <path d="M30 8L16 30h10l-2 16 14-22H28l2-16z" fill="${fillColor}"/>
    </svg>`,
  )}`
}

type IngredientCardItem = {
  itemId: string
  name: string
  iconUrl?: string
  qualityColor?: string
  isBase: boolean
}

const IngredientCard = memo(function IngredientCard({
  item,
  isAdmin,
  buyPrice,
  defaultBuyPrice,
  setBuyPrice,
  setDefaultBuyPrice,
}: {
  item: IngredientCardItem
  isAdmin: boolean
  buyPrice: string
  defaultBuyPrice: string
  setBuyPrice: (itemId: string, value: string) => void
  setDefaultBuyPrice: (itemId: string, value: string) => Promise<void>
}) {
  const [draftBuyPrice, setDraftBuyPrice] = useState(buyPrice)
  const [draftDefaultBuyPrice, setDraftDefaultBuyPrice] = useState(defaultBuyPrice)

  useEffect(() => {
    setDraftBuyPrice(buyPrice)
  }, [buyPrice])

  useEffect(() => {
    setDraftDefaultBuyPrice(defaultBuyPrice)
  }, [defaultBuyPrice])

  return (
    <Stack gap={8} p="md" bd="1px solid var(--mantine-color-default-border)" style={{ borderRadius: 8 }}>
      <ItemBadge
        itemId={item.itemId}
        name={item.name}
        iconUrl={item.iconUrl}
        qualityColor={item.qualityColor}
        size="result"
      />
      <AuctionPrice24hLine itemId={item.itemId} size="sm" layout="stacked" />
      <AdminAuctionTrackingButton itemId={item.itemId} itemName={item.name} />
      <Group wrap="nowrap" align="flex-end">
        <TextInput
          placeholder="Цена скупа за 1 ед."
          value={draftBuyPrice}
          onChange={(event) => {
            const sanitized = event.currentTarget.value.replace(/[^\d]/g, '')
            setDraftBuyPrice(sanitized)
          }}
          style={{ flex: 1 }}
        />
        <Button
          variant="default"
          color="gray"
          onClick={() => setBuyPrice(item.itemId, draftBuyPrice.replace(/[^\d]/g, ''))}
        >
          Сохранить
        </Button>
      </Group>
      {isAdmin ? (
        <>
          <Text size="xs" fw={600} mt={4}>
            Цена по умолчанию для всех
          </Text>
          <Group wrap="nowrap" align="flex-end">
            <TextInput
              placeholder="Цена скупа за 1 ед. по-дефолту"
              value={draftDefaultBuyPrice}
              onChange={(event) => {
                const sanitized = event.currentTarget.value.replace(/[^\d]/g, '')
                setDraftDefaultBuyPrice(sanitized)
              }}
              style={{ flex: 1 }}
            />
            <Button
              variant="default"
              color="gray"
              onClick={() => {
                void (async () => {
                  try {
                    await setDefaultBuyPrice(item.itemId, draftDefaultBuyPrice.replace(/[^\d]/g, ''))
                  } catch {
                    // ignore
                  }
                })()
              }}
            >
              Сохранить
            </Button>
          </Group>
        </>
      ) : null}
    </Stack>
  )
})

export function IngredientsPage() {
  const { recipes, itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const favoriteItemIds = useFavoritesStore((state) => state.favoriteItemIds)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const defaultBuyPricesByItemId = useIngredientPricesStore((s) => s.defaultBuyPricesByItemId)
  const buyPricesByItemId = useIngredientPricesStore((s) => s.buyPricesByItemId)
  const setBuyPrice = useIngredientPricesStore((s) => s.setBuyPrice)
  const setDefaultBuyPrice = useIngredientPricesStore((s) => s.setDefaultBuyPrice)
  const loadRemoteBuyPrices = useIngredientPricesStore((s) => s.loadRemoteBuyPrices)
  const energyPrice = useIngredientPricesStore((s) => s.energyPrice)
  const setEnergyPrice = useIngredientPricesStore((s) => s.setEnergyPrice)
  const [draftEnergyPrice, setDraftEnergyPrice] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'base' | 'favorites'>('all')
  const energyIconSvg = createEnergyIconSvg('#ffffff')

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    void loadRemoteBuyPrices()
  }, [loadRemoteBuyPrices])

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
                        setDraftEnergyPrice(sanitizeDecimalInput(event.currentTarget.value))
                      }
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="default"
                      color="gray"
                      onClick={() => setEnergyPrice(normalizeDecimalPriceForSubmit(draftEnergyPrice))}
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
                  <IngredientCard
                    key={item.itemId}
                    item={item}
                    isAdmin={isAdmin}
                    buyPrice={buyPricesByItemId[item.itemId] ?? ''}
                    defaultBuyPrice={defaultBuyPricesByItemId[item.itemId] ?? ''}
                    setBuyPrice={setBuyPrice}
                    setDefaultBuyPrice={setDefaultBuyPrice}
                  />
                ))}
              </SimpleGrid>
            </>
          ) : null}
        </Stack>
      </SectionCard>
    </PageContainer>
  )
}
