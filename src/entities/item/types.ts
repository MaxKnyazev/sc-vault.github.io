import type { LocalizedText } from '../../shared/types/common'

export type ListingItem = {
  data: string
  icon: string
  name: LocalizedText
  color: string
  status: {
    state: string
  }
}

export type ListingItemWithId = ListingItem & {
  id: string
}
