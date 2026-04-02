export const appConfig = {
  defaultRealm: 'global',
  githubRawBaseUrl:
    'https://raw.githubusercontent.com/EXBO-Studio/stalcraft-database/main',
  defaultLanguage: 'ru',
} as const

export type Realm = 'global' | 'ru'
