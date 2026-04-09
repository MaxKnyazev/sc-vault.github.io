import { Alert, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import {
  deleteAdminUser,
  fetchAdminUsers,
  updateAdminUser,
  type AdminUser,
  type UserRole,
} from '../../shared/api/backendApi'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { getRoleLabel } from '../../shared/lib/authRole'

type DraftByUserId = Record<number, { nickname: string; role: UserRole }>

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [draftByUserId, setDraftByUserId] = useState<DraftByUserId>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingId, setIsSavingId] = useState<number | null>(null)
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const roleOptions = useMemo(
    () => [
      { value: 'blocked', label: getRoleLabel('blocked') },
      { value: 'user', label: getRoleLabel('user') },
      { value: 'admin', label: getRoleLabel('admin') },
    ],
    [],
  )

  const loadUsers = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const nextUsers = await fetchAdminUsers()
      setUsers(nextUsers)
      const nextDrafts: DraftByUserId = {}
      for (const user of nextUsers) {
        nextDrafts[user.id] = { nickname: user.nickname, role: user.role }
      }
      setDraftByUserId(nextDrafts)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const saveUser = async (id: number) => {
    const draft = draftByUserId[id]
    if (!draft) return
    setError(null)
    setIsSavingId(id)
    try {
      await updateAdminUser({
        id,
        nickname: draft.nickname.trim(),
        role: draft.role,
      })
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSavingId(null)
    }
  }

  const removeUser = async (id: number) => {
    setError(null)
    setIsDeletingId(id)
    try {
      await deleteAdminUser(id)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsDeletingId(null)
    }
  }

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text size="xl" fw={700}>
              Пользователи
            </Text>
            <Button variant="default" color="gray" loading={isLoading} onClick={() => void loadUsers()}>
              Обновить
            </Button>
          </Group>

          {error ? <Alert color="red">{error}</Alert> : null}

          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Логин</Table.Th>
                <Table.Th>Роль</Table.Th>
                <Table.Th>Создан</Table.Th>
                <Table.Th>Действия</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>{user.id}</Table.Td>
                  <Table.Td>
                    <TextInput
                      value={draftByUserId[user.id]?.nickname ?? user.nickname}
                      onChange={(event) =>
                        setDraftByUserId((state) => ({
                          ...state,
                          [user.id]: {
                            nickname: event.currentTarget.value,
                            role: (state[user.id]?.role ?? user.role) as UserRole,
                          },
                        }))
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={roleOptions}
                      value={draftByUserId[user.id]?.role ?? user.role}
                      onChange={(value) => {
                        if (!value) return
                        setDraftByUserId((state) => ({
                          ...state,
                          [user.id]: {
                            nickname: state[user.id]?.nickname ?? user.nickname,
                            role: value as UserRole,
                          },
                        }))
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {new Date(user.createdAt).toLocaleString('ru-RU')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Button
                        size="xs"
                        loading={isSavingId === user.id}
                        onClick={() => void saveUser(user.id)}
                      >
                        Редактировать
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        loading={isDeletingId === user.id}
                        onClick={() => void removeUser(user.id)}
                      >
                        Удалить
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </SectionCard>
    </PageContainer>
  )
}

