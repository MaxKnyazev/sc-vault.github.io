import { Alert, Box, Button, Group, Stack, Text } from '@mantine/core'
import { useAuctionPricesStore } from '../../shared/store/auctionPricesStore'

type AuctionRefreshToolbarProps = {
  itemIds: string[]
}

export function AuctionRefreshToolbar({ itemIds }: AuctionRefreshToolbarProps) {
  const refreshAll = useAuctionPricesStore((s) => s.refreshAll)
  const isRefreshing = useAuctionPricesStore((s) => s.isRefreshing)
  const progress = useAuctionPricesStore((s) => s.progress)
  const error = useAuctionPricesStore((s) => s.error)
  const resetError = useAuctionPricesStore((s) => s.resetError)

  return (
    <Stack gap="xs">
      {error ? (
        <Alert color="red" title="Аукцион" withCloseButton onClose={resetError}>
          <Box
            style={{
              maxHeight: 360,
              overflowY: 'auto',
              wordBreak: 'break-word',
            }}
          >
            <Text size="sm" component="pre" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              {error}
            </Text>
          </Box>
        </Alert>
      ) : null}
      <Group gap="md" align="center" wrap="wrap">
        <Button
          loading={isRefreshing}
          onClick={() => {
            void refreshAll(itemIds)
          }}
        >
          Обновить цены аукциона (12ч)
        </Button>
        {progress ? (
          <Text size="sm" c="dimmed">
            Запросов: {progress.done} / {progress.total}
          </Text>
        ) : null}
      </Group>
    </Stack>
  )
}
