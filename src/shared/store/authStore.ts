import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  BackendApiError,
  fetchBackendMe,
  loginBackendUser,
  logoutBackendUser,
  registerBackendUser,
  type AuthUser,
  type CraftBranchLevels,
  updateOwnProfile,
} from '../api/backendApi'
import { getBackendApiBaseUrl } from '../config/backendApi'

const AUTH_TOKEN_STORAGE_KEY = 'sc-vault-auth-token'

function writeTokenToStorage(token: string | null): void {
  try {
    if (!token) {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      return
    }
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  } catch {
    // Ignore storage errors in restricted contexts.
  }
}

function readTokenFromStorage(): string | null {
  try {
    const value = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    return value && value.trim() !== '' ? value : null
  } catch {
    return null
  }
}

type AuthStore = {
  token: string | null
  user: AuthUser | null
  isAuthResolved: boolean
  isSubmitting: boolean
  error: string | null
  bootstrapAuth: () => Promise<void>
  login: (nickname: string, password: string) => Promise<void>
  register: (nickname: string, password: string) => Promise<void>
  logout: () => Promise<void>
  saveProfilePreferences: (input: {
    timezoneOffsetHours: number
    craftBranchLevels: CraftBranchLevels
  }) => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthResolved: false,
      isSubmitting: false,
      error: null,
      clearError: () => set({ error: null }),
      bootstrapAuth: async () => {
        if (!getBackendApiBaseUrl()) {
          set({ token: null, user: null, isAuthResolved: true, error: null })
          return
        }
        const token = get().token ?? readTokenFromStorage()
        if (!token) {
          set({ user: null, isAuthResolved: true, error: null })
          return
        }
        try {
          const user = await fetchBackendMe(token)
          writeTokenToStorage(token)
          set({ token, user, isAuthResolved: true, error: null })
        } catch (err) {
          // Keep session on transient network/CORS errors.
          // Drop session only when backend explicitly rejects token.
          if (err instanceof BackendApiError && (err.status === 401 || err.status === 403)) {
            writeTokenToStorage(null)
            set({ token: null, user: null, isAuthResolved: true, error: null })
            return
          }
          set({ isAuthResolved: true })
        }
      },
      login: async (nickname, password) => {
        set({ isSubmitting: true, error: null })
        try {
          const payload = await loginBackendUser(nickname, password)
          if (!payload.token || !payload.user) throw new Error('Некорректный ответ сервера')
          writeTokenToStorage(payload.token)
          set({ token: payload.token, user: payload.user, isSubmitting: false, isAuthResolved: true })
        } catch (err) {
          set({
            isSubmitting: false,
            error: err instanceof Error ? err.message : String(err),
          })
          throw err
        }
      },
      register: async (nickname, password) => {
        set({ isSubmitting: true, error: null })
        try {
          const payload = await registerBackendUser(nickname, password)
          if (!payload.token || !payload.user) throw new Error('Некорректный ответ сервера')
          writeTokenToStorage(payload.token)
          set({ token: payload.token, user: payload.user, isSubmitting: false, isAuthResolved: true })
        } catch (err) {
          set({
            isSubmitting: false,
            error: err instanceof Error ? err.message : String(err),
          })
          throw err
        }
      },
      logout: async () => {
        const token = get().token
        set({ isSubmitting: true, error: null })
        try {
          if (token) {
            await logoutBackendUser(token)
          }
        } catch {
          // Ignore logout API failures and clear local session.
        } finally {
          writeTokenToStorage(null)
          set({ token: null, user: null, isSubmitting: false, isAuthResolved: true, error: null })
        }
      },
      saveProfilePreferences: async ({ timezoneOffsetHours, craftBranchLevels }) => {
        set({ isSubmitting: true, error: null })
        try {
          const user = await updateOwnProfile({ timezoneOffsetHours, craftBranchLevels })
          set({ user, isSubmitting: false, error: null })
        } catch (err) {
          set({
            isSubmitting: false,
            error: err instanceof Error ? err.message : String(err),
          })
          throw err
        }
      },
    }),
    {
      name: 'sc-vault-auth',
      partialize: (state) => ({ token: state.token }),
    },
  ),
)

