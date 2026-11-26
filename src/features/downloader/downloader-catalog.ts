import { DOWNLOADER_GROUPS, DOWNLOADER_MODES } from '../../../shared/downloader.js'
import type { DownloaderMode, DownloaderPlatform } from '../../../shared/downloader.js'

export type { DownloaderMode, DownloaderPlatform }
export { DOWNLOADER_GROUPS, DOWNLOADER_MODES }

export type DownloaderItemKind = 'video' | 'image' | 'audio'

export interface DownloaderItem {
  id: string
  kind: DownloaderItemKind
  label: string
  ext: string
  mimeType: string
  width?: number
  height?: number
  filename: string
  previewUrl: string
  downloadUrl: string
  thumbUrl?: string
}

export interface DownloaderResult {
  platform: DownloaderPlatform
  mode: DownloaderMode
  resolvedMode: DownloaderMode
  title: string
  author: string
  sourceUrl: string
  items: DownloaderItem[]
}

export interface DownloaderStatus {
  ytDlpAvailable: boolean
  ffmpegAvailable: boolean
}

export interface DownloaderHistoryItem {
  id: string
  mode: DownloaderMode
  platform: DownloaderPlatform
  sourceUrl: string
  title: string
  author: string
  itemCount: number
  createdAt: string
}

export function getDownloaderTool(mode: DownloaderMode) {
  return DOWNLOADER_MODES.find((item) => item.mode === mode) || DOWNLOADER_MODES[0]
}
