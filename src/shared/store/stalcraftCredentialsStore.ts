import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type StalcraftCredentialsState = {
  clientId: string
  clientSecret: string
  /** Записывает в store и localStorage (persist) одним обновлением. */
  saveCredentials: (clientId: string, clientSecret: string) => void
}

export const useStalcraftCredentialsStore = create<StalcraftCredentialsState>()(
  persist(
    (set) => ({
      clientId: '',
      clientSecret: '',
      saveCredentials: (clientId, clientSecret) => set({ clientId, clientSecret }),
    }),
    {
      name: 'sc-vault-stalcraft-credentials',
      partialize: (s) => ({ clientId: s.clientId, clientSecret: s.clientSecret }),
    },
  ),
)
