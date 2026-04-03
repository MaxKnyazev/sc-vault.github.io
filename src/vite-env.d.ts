/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STALCRAFT_API_TOKEN?: string
  readonly VITE_STALCRAFT_API_CLIENT_ID?: string
  readonly VITE_STALCRAFT_API_CLIENT_SECRET?: string
  readonly VITE_STALCRAFT_API_BASE_URL?: string
  readonly VITE_STALCRAFT_AUCTION_REGION?: string
  readonly VITE_STALCRAFT_AUCTION_CONCURRENCY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
