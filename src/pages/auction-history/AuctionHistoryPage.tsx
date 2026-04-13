import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { AuctionPrice24hLine } from '../../components/auction-price-24h/AuctionPrice24hLine'
import {
  addTrackedAuctionItem,
  fetchTrackedAuctionItems,
  removeTrackedAuctionItem,
} from '../../shared/api/backendApi'
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
  const [isRemovingItemId, setIsRemovingItemId] = useState<string | null>(null)
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null)
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
  const pendingDeleteItem = useMemo(
    () => trackedItems.find((item) => item.itemId === pendingDeleteItemId) ?? null,
    [pendingDeleteItemId, trackedItems],
  )

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

          {trackedError ? <Alert color="red">{trackedError}</Alert> : null}
          {isLoading || isLoadingTracked ? <Loader size="sm" /> : null}
          {error ? <Alert color="red">{error}</Alert> : null}

          {!isLoading && !isLoadingTracked ? (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
              {filteredTrackedItems.map((item) => (
                <Stack
                  key={item.itemId}
                  gap={6}
                  p="md"
                  bd="1px solid var(--mantine-color-default-border)"
                  style={{ borderRadius: 8 }}
                >
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <ItemBadge
                      itemId={item.itemId}
                      name={item.name}
                      iconUrl={item.iconUrl}
                      qualityColor={item.qualityColor}
                      size="result"
                      showFavoriteButton={false}
                    />
                    <ActionIcon
                      size={40}
                      color="red"
                      variant="light"
                      aria-label="Удалить из отслеживания"
                      title="Удалить из отслеживания"
                      loading={isRemovingItemId === item.itemId}
                      onClick={() => setPendingDeleteItemId(item.itemId)}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </ActionIcon>
                  </Group>
                  <AuctionPrice24hLine
                    itemId={item.itemId}
                    size="sm"
                    showNoCacheHint={false}
                    hideWhenNoData
                  />
                </Stack>
              ))}
            </SimpleGrid>
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
        removeScrollProps={{
          removeScrollBar: false,
        }}
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
                    name={item.name}
                    iconUrl={item.iconUrl}
                    qualityColor={item.qualityColor}
                    size="ingredient"
                    showFavoriteButton={false}
                  />
                  <Button
                    size="sm"
                    disabled={trackedSet.has(item.itemId)}
                    loading={isAddingItemId === item.itemId}
                    style={{ minWidth: 112, whiteSpace: 'nowrap', flexShrink: 0 }}
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

      <Modal
        opened={pendingDeleteItem !== null}
        onClose={() => {
          if (!isRemovingItemId) setPendingDeleteItemId(null)
        }}
        title={null}
        withCloseButton={false}
        centered
        size="sm"
        removeScrollProps={{
          removeScrollBar: false,
        }}
        styles={authModalGlowModalStyles}
      >
        <Stack gap="sm">
          <Text size="md" fw={700}>
            Подтверждение удаления
          </Text>
          <Text size="sm">
            Удалить предмет «{pendingDeleteItem?.name ?? pendingDeleteItem?.itemId ?? ''}» из отслеживания?
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              color="gray"
              disabled={Boolean(isRemovingItemId)}
              onClick={() => setPendingDeleteItemId(null)}
            >
              Отмена
            </Button>
            <Button
              color="red"
              loading={Boolean(isRemovingItemId)}
              onClick={async () => {
                if (!pendingDeleteItem) return
                setIsRemovingItemId(pendingDeleteItem.itemId)
                setTrackedError(null)
                try {
                  await removeTrackedAuctionItem(pendingDeleteItem.itemId)
                  setTrackedItemIds((prev) => prev.filter((id) => id !== pendingDeleteItem.itemId))
                  setPendingDeleteItemId(null)
                } catch (e) {
                  setTrackedError(
                    e instanceof Error ? e.message : 'Не удалось удалить предмет из отслеживания',
                  )
                } finally {
                  setIsRemovingItemId(null)
                }
              }}
            >
              Удалить
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageContainer>
  )
}

