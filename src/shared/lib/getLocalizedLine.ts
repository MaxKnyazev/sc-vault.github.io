export function getLocalizedLine(
  lines: Record<string, string> | undefined,
  preferredLanguage = 'ru',
): string {
  if (!lines) return ''
  return lines[preferredLanguage] ?? lines.en ?? Object.values(lines)[0] ?? ''
}
