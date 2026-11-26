export type DownloaderPlatform = 'tiktok' | 'instagram'

export type DownloaderGroupId = DownloaderPlatform

export type DownloaderMode =
  | 'tiktok_video'
  | 'tiktok_photo'
  | 'tiktok_story'
  | 'instagram_reel'
  | 'instagram_photo'
  | 'instagram_story'

export interface DownloaderGroup {
  id: DownloaderGroupId
  label: string
}

export interface DownloaderToolDefinition {
  mode: DownloaderMode
  platform: DownloaderPlatform
  group: DownloaderGroupId
  title: string
  kindLabel: string
  description: string
  placeholder: string
}

export const DOWNLOADER_GROUPS: DownloaderGroup[]
export const DOWNLOADER_MODES: DownloaderToolDefinition[]

export function detectDownloaderModeFromUrl(urlString: string, fallbackMode?: DownloaderMode): DownloaderMode
export function normalizeAndValidateUrl(
  input: string,
  mode?: DownloaderMode
): { url: string; platform: DownloaderPlatform; detectedMode: DownloaderMode }
export function isAllowedMediaProxyHost(hostname: string): boolean
export function sanitizeDownloadFilename(name: string, ext?: string): string
export function shortcodeToInstagramMediaId(shortcode: string): string
export function normalizeInstagramSessionInput(raw: string): {
  netscape: string
  header: string
  userId: string
  masked: string
}
