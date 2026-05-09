import { ActionIcon, Avatar, Box, Group, Paper, Stack, Text } from '@mantine/core'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { useAuctionDealToastsStore, type AuctionDealToast } from '../../shared/store/auctionDealToastsStore'
import { useAuctionHistoryItemModalStore } from '../../shared/store/auctionHistoryItemModalStore'

const TOAST_MS = 10_000

function DealToastRow({
  toast,
  onDismiss,
  onActivate,
}: {
  toast: AuctionDealToast
  onDismiss: () => void
  onActivate: () => void
}) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      useAuctionDealToastsStore.getState().dismiss(toast.id)
    }, TOAST_MS)
    return () => window.clearTimeout(id)
  }, [toast.id])

  return (
    <Paper
      className="auction-deal-toast-paper"
      shadow="md"
      p="sm"
      withBorder
      radius="md"
      style={{
        pointerEvents: 'auto',
        background: 'var(--mantine-color-body)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
      onClick={onActivate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Avatar src={toast.iconUrl} radius="sm" size={44} alt="" />
        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={700} lineClamp={2}>
            Выгодный лот: {toast.name}
          </Text>
          <Text size="xs" c="dimmed">
            От {formatAuctionRub(toast.minPrice)} ₽/ед. при вашем скупе
          </Text>
        </Stack>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Закрыть уведомление"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
        >
          ✕
        </ActionIcon>
      </Group>
      <Box
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: 'var(--mantine-color-dark-3)',
        }}
      >
        <Box
          key={toast.id}
          className="auction-deal-toast-progress"
          style={{
            height: '100%',
            width: '100%',
            background: 'var(--mantine-color-blue-6)',
            transformOrigin: '100% 50%',
          }}
        />
      </Box>
    </Paper>
  )
}

export function AuctionDealToastPortal() {
  const toasts = useAuctionDealToastsStore((s) => s.toasts)
  const dismiss = useAuctionDealToastsStore((s) => s.dismiss)
  const openModal = useAuctionHistoryItemModalStore((s) => s.open)

  if (typeof document === 'undefined') return null

  return createPortal(
    <Box
      className="auction-deal-toast-root"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 5000,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 360,
        width: 'min(360px, calc(100vw - 32px))',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <DealToastRow
          key={toast.id}
          toast={toast}
          onDismiss={() => dismiss(toast.id)}
          onActivate={() => {
            openModal(toast.itemId, {
              initialView: 'activeLots',
              initialQuality: toast.initialQuality ?? null,
              initialUpgrade: toast.initialUpgrade ?? null,
            })
            dismiss(toast.id)
          }}
        />
      ))}
    </Box>,
    document.body,
  )
}
