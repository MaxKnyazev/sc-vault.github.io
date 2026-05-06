export function isArtifactDataPath(dataPath: string | undefined): boolean {
  const normalized = (dataPath ?? '').toLowerCase()
  return normalized.includes('/artefact/') || normalized.includes('/artifact/')
}

export function isModuleCoreItem(dataPath: string | undefined, itemName: string): boolean {
  const normalizedPath = (dataPath ?? '').toLowerCase()
  const normalizedName = itemName.toLowerCase()
  return (
    normalizedPath.includes('/module/core/') ||
    normalizedPath.includes('/modules/core/') ||
    normalizedName.includes('ядро модуля') ||
    normalizedName.includes('module core')
  )
}

