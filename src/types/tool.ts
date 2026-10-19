export type ToolCategory =
  | 'all'
  | 'ai'
  | 'dev'
  | 'productivity'
  | 'media'
  | 'utility'
  | 'cloud'

export interface ToolItem {
  id: string
  name: string
  description: string
  url: string
  category: ToolCategory
  icon: string
  gradient: string
  iconColor?: string
  isFavorite?: boolean
  isLocalhost?: boolean
  port?: number | string
  status?: 'online' | 'offline' | 'standby'
  tags?: string[]
}
