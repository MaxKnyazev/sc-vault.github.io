import { Alert, Button, Group, Loader, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { AuctionRefreshToolbar } from '../../components/auction-refresh-toolbar/AuctionRefreshToolbar'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { AuctionPrice24hLine } from '../../components/auction-price-24h/AuctionPrice24hLine'
import { addTrackedAuctionItem, fetchTrackedAuctionItems } from '../../shared/api/backendApi'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { authModalGlowModalStyles } from '../../shared/lib/authModalGlowStyles'

export function AuctionHistoryPage() {
  const { itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const [trackedItemIds, setTrackedItemIds] = useState<string[]>([])
  const [isLoadingTracked, setIsLoadingTracked] = useState(false)
  const [search, setSearch] = useState('')
  const [isModalOpened, setIsModalOpened] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [isAddingItemId, setIsAddingItemId] = useState<string | null>(null)
  const [trackedError, setTrackedError] = useState<string | null>(null)

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    void (async () => {
      setIsLoadingTracked(true)
      setTrackedError(null)
      try {
        const ids = await fetchTrackedAuctionItems()
        setTrackedItemIds(ids)
      } catch (e) {
        setTrackedError(e instanceof Error ? e.message : 'Не удалось загрузить отслеживаемые предметы')
      } finally {
        setIsLoadingTracked(false)
      }
    })()
  }, [])

  const trackedItems = useMemo(() => {
    return trackedItemIds
      .map((itemId) => {
        const item = itemsById[itemId]
        return {
          itemId,
          name: getItemName(item?.name?.lines) || itemId,
          iconUrl: item ? buildItemIconUrl(item.icon, realm) : undefined,
          qualityColor: item?.color,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [itemsById, realm, trackedItemIds])

  const filteredTrackedItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return trackedItems
    return trackedItems.filter((item) => `${item.name} ${item.itemId}`.toLowerCase().includes(query))
  }, [search, trackedItems])

  const allItems = useMemo(() => {
    return Object.values(itemsById)
      .map((item) => ({
        itemId: item.id,
        name: getItemName(item.name?.lines) || item.id,
        iconUrl: buildItemIconUrl(item.icon, realm),
        qualityColor: item.color,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [itemsById, realm])

  const filteredModalItems = useMemo(() => {
    const query = modalSearch.trim().toLowerCase()
    if (!query) return allItems
    return allItems.filter((item) => `${item.name} ${item.itemId}`.toLowerCase().includes(query))
  }, [allItems, modalSearch])

  const trackedSet = useMemo(() => new Set(trackedItemIds), [trackedItemIds])

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md">
          <Text size="xl" fw={700}>
            История аукциона
          </Text>

          <Group align="flex-end" wrap="wrap">
            <TextInput
              placeholder="Поиск: название или ID предмета..."
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              style={{ flex: 1, minWidth: 280 }}
            />
            <Button
              onClick={() => {
                setModalSearch('')
                setTrackedError(null)
                setIsModalOpened(true)
              }}
            >
              Отслеживать новый предмет
            </Button>
          </Group>

          <AuctionRefreshToolbar itemIds={trackedItemIds} />

          {trackedError ? <Alert color="red">{trackedError}</Alert> : null}
          {isLoading || isLoadingTracked ? <Loader size="sm" /> : null}
          {error ? <Alert color="red">{error}</Alert> : null}

          {!isLoading && !isLoadingTracked ? (
            <Stack gap="sm">
              {filteredTrackedItems.map((item) => (
                <Stack
                  key={item.itemId}
                  gap={6}
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
                </Stack>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </SectionCard>

      <Modal
        opened={isModalOpened}
        onClose={() => setIsModalOpened(false)}
        title={null}
        withCloseButton={false}
        centered
        size="lg"
        styles={authModalGlowModalStyles}
      >
        <Stack gap="sm">
          <Text size="lg" fw={700}>
            Добавить предмет в отслеживание
          </Text>
          <TextInput
            placeholder="Поиск по всем предметам STALCRAFT..."
            value={modalSearch}
            onChange={(event) => setModalSearch(event.currentTarget.value)}
          />
          <ScrollArea.Autosize mah="60vh">
            <Stack gap="xs">
              {filteredModalItems.map((item) => (
                <Group
                  key={`modal-item-${item.itemId}`}
                  justify="space-between"
                  align="center"
                  p="xs"
                  bd="1px solid var(--mantine-color-default-border)"
                  style={{ borderRadius: 8 }}
                  wrap="nowrap"
                >
                  <ItemBadge
                    itemId={item.itemId}
                    name={item.name}
                    iconUrl={item.iconUrl}
                    qualityColor={item.qualityColor}
                    size="ingredient"
                    showFavoriteButton={false}
                  />
                  <Button
                    size="xs"
                    disabled={trackedSet.has(item.itemId)}
                    loading={isAddingItemId === item.itemId}
                    onClick={async () => {
                      setIsAddingItemId(item.itemId)
                      setTrackedError(null)
                      try {
                        await addTrackedAuctionItem(item.itemId)
                        setTrackedItemIds((prev) => [...new Set([...prev, item.itemId])])
                      } catch (e) {
                        setTrackedError(
                          e instanceof Error ? e.message : 'Не удалось добавить предмет в отслеживание',
                        )
                      } finally {
                        setIsAddingItemId(null)
                      }
                    }}
                  >
                    {trackedSet.has(item.itemId) ? 'Добавлено' : 'Добавить'}
                  </Button>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Modal>
    </PageContainer>
  )
}

