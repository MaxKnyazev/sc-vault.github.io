import { Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useStalcraftCredentialsStore } from '../../shared/store/stalcraftCredentialsStore'

function syncDraftFromStore() {
  const s = useStalcraftCredentialsStore.getState()
  return { clientId: s.clientId, clientSecret: s.clientSecret }
}

export function StalcraftCredentialsNavFields() {
  const saveCredentials = useStalcraftCredentialsStore((s) => s.saveCredentials)

  const [draftId, setDraftId] = useState(() => syncDraftFromStore().clientId)
  const [draftSecret, setDraftSecret] = useState(() => syncDraftFromStore().clientSecret)

  useEffect(() => {
    return useStalcraftCredentialsStore.persist.onFinishHydration(() => {
      const next = syncDraftFromStore()
      setDraftId(next.clientId)
      setDraftSecret(next.clientSecret)
    })
  }, [])

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed" fw={600}>
        API аукциона
      </Text>
      <TextInput
        label="Client ID"
        placeholder="ID приложения"
        value={draftId}
        onChange={(e) => setDraftId(e.currentTarget.value)}
        size="xs"
        autoComplete="off"
      />
      <PasswordInput
        label="Client Secret"
        placeholder="Секрет"
        value={draftSecret}
        onChange={(e) => setDraftSecret(e.currentTarget.value)}
        size="xs"
        autoComplete="off"
      />
      <Button
        size="xs"
        onClick={() => {
          saveCredentials(draftId, draftSecret)
        }}
      >
        Сохранить
      </Button>
    </Stack>
  )
}
