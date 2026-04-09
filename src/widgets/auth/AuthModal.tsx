import { Alert, Button, Group, Modal, PasswordInput, Stack, Tabs, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../shared/store/authStore'

type AuthModalProps = {
  opened: boolean
  onClose: () => void
  initialMode?: 'login' | 'register'
}

export function AuthModal({ opened, onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const clearError = useAuthStore((s) => s.clearError)
  const isSubmitting = useAuthStore((s) => s.isSubmitting)
  const apiError = useAuthStore((s) => s.error)

  const resetForm = () => {
    setNickname('')
    setPassword('')
    setConfirmPassword('')
    setLocalError(null)
    clearError()
  }

  useEffect(() => {
    if (opened) {
      setMode(initialMode)
    }
  }, [initialMode, opened])

  const closeModal = () => {
    resetForm()
    onClose()
  }

  const submit = async () => {
    setLocalError(null)
    clearError()

    const normalizedNickname = nickname.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,32}$/.test(normalizedNickname)) {
      setLocalError('Ник должен быть 3-32 символа: латиница, цифры, underscore')
      return
    }
    if (password.length < 6) {
      setLocalError('Пароль должен быть не короче 6 символов')
      return
    }
    if (mode === 'register' && password !== confirmPassword) {
      setLocalError('Пароли не совпадают')
      return
    }

    try {
      if (mode === 'login') {
        await login(normalizedNickname, password)
      } else {
        await register(normalizedNickname, password)
      }
      closeModal()
    } catch {
      // Error is already handled in store and rendered below.
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={mode === 'login' ? 'Вход' : 'Регистрация'}
      centered
      size="sm"
    >
      <Stack gap="sm">
        <Tabs
          value={mode}
          onChange={(value) => {
            if (value === 'login' || value === 'register') {
              setMode(value)
              setLocalError(null)
              clearError()
            }
          }}
        >
          <Tabs.List grow>
            <Tabs.Tab value="login">Вход</Tabs.Tab>
            <Tabs.Tab value="register">Регистрация</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        <TextInput
          label="Логин (nickname)"
          placeholder="например: player_1"
          value={nickname}
          onChange={(event) => setNickname(event.currentTarget.value)}
          autoComplete="username"
        />
        <PasswordInput
          label="Пароль"
          placeholder="Минимум 6 символов"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
        {mode === 'register' ? (
          <PasswordInput
            label="Повторите пароль"
            placeholder="Повторите пароль"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            autoComplete="new-password"
          />
        ) : null}

        {localError ? <Alert color="red">{localError}</Alert> : null}
        {apiError ? <Alert color="red">{apiError}</Alert> : null}

        <Group justify="flex-end">
          <Button variant="default" color="gray" onClick={closeModal}>
            Отмена
          </Button>
          <Button loading={isSubmitting} onClick={() => void submit()}>
            {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

