export type LocalizedText = {
  type: 'translation' | 'text'
  key?: string
  text?: string
  lines?: Record<string, string>
}
