function readEnvString(key: string): string | undefined {
  const value = import.meta.env[key as keyof ImportMetaEnv]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function getBackendApiBaseUrl(): string | undefined {
  return readEnvString('VITE_BACKEND_API_BASE_URL')
}

export function getBackendAuthToken(): string | undefined {
  try {
    const fromStorage = localStorage.getItem('sc-vault-auth-token')
    return fromStorage && fromStorage.trim() !== '' ? fromStorage : undefined
  } catch {
    return undefined
  }
}

