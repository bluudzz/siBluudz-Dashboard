import {
  LayoutGrid,
  Star,
  Settings,
  ShieldCheck,
  Receipt,
  Sparkles,
  Mail,
} from 'lucide-react'

interface NavItem {
  title: string
  id: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  description: string
  adminOnly?: boolean
}

export interface NavSection {
  title: string
  adminOnly?: boolean
  items: NavItem[]
}

export const navigationSections: NavSection[] = [
  {
    title: 'Mission Control',
    items: [
      {
        title: 'App Launcher',
        id: 'overview',
        icon: LayoutGrid,
        badge: 'Home',
        description: 'Menu utama kotak icon ala smartphone',
      },
      {
        title: 'Favorit Pinned',
        id: 'favorites',
        icon: Star,
        badge: undefined,
        description: 'Tool dan project yang paling sering dibuka',
      },
    ],
  },
  {
    title: 'Aplikasi',
    items: [
      {
        title: 'Prompt Studio',
        id: 'prompt-studio',
        icon: Sparkles,
        description: 'Rancang dengan AI pintar, kerjakan dengan AI hemat',
      },
      {
        title: 'AI Generator',
        id: 'ai-generator',
        icon: Sparkles,
        badge: 'AI',
        description: 'Generate prompt, struktur invoice & follow-up',
      },
      {
        title: 'Invoice',
        id: 'invoice',
        icon: Receipt,
        badge: 'App',
        description: 'Daftar riwayat tagihan & editor invoice / penawaran PDF',
      },
      {
        title: 'Email Manager',
        id: 'email-manager',
        icon: Mail,
        badge: 'IMAP',
        description: 'Kelola akun email dan baca inbox melalui IMAP TLS',
      },
    ],
  },
  {
    title: 'Sistem Pribadi',
    items: [
      {
        title: 'Security Vault',
        id: 'security',
        icon: ShieldCheck,
        badge: undefined,
        description: 'API keys, password vault & 2FA',
      },
      {
        title: 'Pengaturan',
        id: 'settings',
        icon: Settings,
        badge: undefined,
        description: 'Preferensi profil, tema tampilan & kontrol sistem',
      },
    ],
  },
]
