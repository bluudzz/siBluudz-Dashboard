export type GeneratorMode =
  | 'prompt_checker'
  | 'prompt_studio'
  | 'website_prompt'
  | 'image_prompt'
  | 'product_swap'
  | 'relight_studio'

export type ToolGroup = 'text' | 'visual'

export interface ToolDefinition {
  mode: GeneratorMode
  group: ToolGroup
  kindLabel: string
  title: string
  headerTitle?: string
  description: string
  inputLabel: string
  placeholder: string
  contextLabel: string
  contextPlaceholder: string
  action: string
  resultTitle: string
  checklist: string[]
}

export const toolGroups: { id: ToolGroup; label: string }[] = [
  { id: 'text', label: 'Teks & Prompt' },
  { id: 'visual', label: 'Visual & Foto' },
]

export const generatorTools: ToolDefinition[] = [
  {
    mode: 'prompt_checker',
    group: 'text',
    kindLabel: 'Evaluasi',
    title: 'Prompt Checker',
    description: 'Periksa kejelasan prompt dan temukan bagian yang masih kurang.',
    inputLabel: 'Prompt yang akan dievaluasi',
    placeholder: 'Tempel prompt lengkap yang ingin kamu periksa.',
    contextLabel: 'Kriteria penilaian',
    contextPlaceholder: 'Misalnya: kejelasan instruksi, kelengkapan konteks, potensi jawaban melenceng.',
    action: 'Evaluasi prompt',
    resultTitle: 'Evaluasi & saran',
    checklist: ['Bagian yang sudah jelas', 'Ambiguitas dan konteks yang hilang', 'Saran perbaikan yang bisa diterapkan'],
  },
  {
    mode: 'prompt_studio',
    group: 'text',
    kindLabel: 'Lokal',
    title: 'Prompt Studio',
    description: 'Siapkan arahan desain untuk AI pintar, lalu instruksi implementasi untuk AI hemat.',
    inputLabel: '',
    placeholder: '',
    contextLabel: '',
    contextPlaceholder: '',
    action: '',
    resultTitle: '',
    checklist: [],
  },
  {
    mode: 'website_prompt',
    group: 'text',
    kindLabel: 'Coding',
    title: 'Website / Coding Prompt',
    description: 'Tentukan spesifikasi website atau fitur untuk coding assistant.',
    inputLabel: 'Website atau fitur yang ingin dibuat',
    placeholder: 'Jelaskan jenis proyek, halaman, fitur utama, serta perilaku yang kamu inginkan.',
    contextLabel: 'Stack & batasan proyek',
    contextPlaceholder: 'Misalnya: React + Tailwind, gunakan komponen yang ada, pertahankan login.',
    action: 'Susun spesifikasi',
    resultTitle: 'Spesifikasi coding',
    checklist: ['Halaman, fitur, dan alur pengguna', 'Stack dan batas pekerjaan', 'Responsivitas serta kriteria selesai'],
  },
  {
    mode: 'image_prompt',
    group: 'text',
    kindLabel: 'Prompt visual',
    title: 'Prompt Visual',
    description: 'Susun prompt teks visual yang presisi untuk model gambar AI modern.',
    inputLabel: 'Ide gambar yang ingin dibuat',
    placeholder: 'Jelaskan subjek utama, bahan/tekstur, suasana, latar, dan tujuan penggunaan gambar.',
    contextLabel: 'Detail tambahan & hal yang dihindari',
    contextPlaceholder: 'Misalnya: kemasan kopi matte hitam 250g, tanpa teks/watermark, nuansa hangat.',
    action: 'Susun prompt visual',
    resultTitle: 'Prompt visual siap pakai',
    checklist: ['Prompt utama sesuai model gambar', 'Variasi komposisi siap salin', 'Rincian cahaya, framing, dan warna'],
  },
  {
    mode: 'product_swap',
    group: 'visual',
    kindLabel: 'Edit produk',
    title: 'Ganti Produk di Foto',
    description: 'Gunakan foto referensi sebagai suasana dan foto produk sebagai objek pengganti.',
    inputLabel: 'Arahan penggantian (opsional)',
    placeholder: 'Jelaskan posisi produk, pencahayaan, atau detail yang harus dipertahankan.',
    contextLabel: '',
    contextPlaceholder: '',
    action: 'Ganti produk',
    resultTitle: 'Foto hasil penggantian',
    checklist: ['Foto referensi menentukan suasana', 'Foto produk menjadi objek pengganti', 'Arahan tambahan mengatur detail'],
  },
  {
    mode: 'relight_studio',
    group: 'visual',
    kindLabel: 'Studio cahaya',
    title: 'Relight Studio',
    headerTitle: 'Relight Studio by siBluudz',
    description: 'Atur pencahayaan foto dengan detail asli tetap terjaga.',
    inputLabel: '',
    placeholder: '',
    contextLabel: '',
    contextPlaceholder: '',
    action: 'Terapkan lighting',
    resultTitle: 'Hasil pencahayaan',
    checklist: [],
  },
]

export function composeToolPrompt(input: string, context: string, label: string): string {
  return context.trim() ? `${input.trim()}\n\n${label}:\n${context.trim()}` : input
}
