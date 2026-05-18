import { Alert, Box, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { normalizeAuctionHybridSettings, type AuctionHybridSettings } from '../../shared/api/backendApi'
import { useAuthStore } from '../../shared/store/authStore'
import { AuctionHybridSettingsFormFields } from './AuctionHybridSettingsFormFields'

type Props = {
  opened: boolean
  onClose: () => void
  /** Вызывается после успешного сохранения (перезагрузка цен на странице) */
  onSaved?: () => void
}

export function AuctionHybridSettingsModal({ opened, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user)
  const isSubmitting = useAuthStore((s) => s.isSubmitting)
  const authError = useAuthStore((s) => s.error)
  const saveAuctionHybridSettings = useAuthStore((s) => s.saveAuctionHybridSettings)

  const [draft, setDraft] = useState<AuctionHybridSettings>(() =>
    normalizeAuctionHybridSettings(user?.auctionHybridSettings),
  )

  useEffect(() => {
    if (!opened) return
    setDraft(normalizeAuctionHybridSettings(user?.auctionHybridSettings))
  }, [opened, user?.auctionHybridSettings])

  const handleSave = async () => {
    try {
      await saveAuctionHybridSettings(draft)
      onSaved?.()
      onClose()
    } catch {
      // Ошибка в authStore.error
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Аукцион для себестоимости"
      size="md"
      centered
      overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed" lh={1.5}>
          Эти параметры влияют на гибридную оценку (min скуп / аукцион / крафт) на страницах «Крафты» и «Заказы».
          Сохраняются в вашем профиле на сервере.
        </Text>

        <Box
          p="md"
          style={{
            borderRadius: 12,
            border: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-default-hover)',
          }}
        >
          <AuctionHybridSettingsFormFields value={draft} onChange={setDraft} disabled={isSubmitting} />
        </Box>

        {authError ? (
          <Alert color="red" variant="light">
            {authError}
          </Alert>
        ) : null}

        <Group justify="flex-end" gap="sm" mt="xs">
          <Button variant="default" onClick={onClose} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button loading={isSubmitting} onClick={() => void handleSave()}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
