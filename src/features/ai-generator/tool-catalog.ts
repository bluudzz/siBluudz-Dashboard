export type GeneratorMode = 'prompt_builder' | 'prompt_optimizer' | 'prompt_checker' | 'humanizer' | 'prompt_reframer' | 'prompt_studio' | 'website_prompt' | 'image_prompt' | 'video_prompt' | 'product_swap' | 'invoice_items' | 'proposal_structure' | 'follow_up_message'

interface ToolDefinition {
  mode: GeneratorMode
  title: string
  description: string
  inputLabel: string
  placeholder: string
  contextLabel: string
  contextPlaceholder: string
  action: string
  resultTitle: string
  checklist: string[]
}

export const generatorTools: ToolDefinition[] = [
  { mode: 'prompt_builder', title: 'Prompt Generator', description: 'Susun ide menjadi instruksi AI yang jelas dan siap disalin.', inputLabel: 'Ide atau tugas yang ingin dibuat', placeholder: 'Jelaskan tujuan, siapa pengguna hasilnya, dan hasil akhir yang kamu harapkan.', contextLabel: 'Audiens & konteks penggunaan', contextPlaceholder: 'Misalnya: pemilik UMKM, untuk kalender konten Instagram.', action: 'Susun prompt', resultTitle: 'Prompt siap pakai', checklist: ['Tujuan dan peran AI', 'Konteks serta batasan tugas', 'Format jawaban yang diharapkan'] },
  { mode: 'prompt_optimizer', title: 'Prompt Optimizer', description: 'Perbaiki instruksi yang sudah ada agar lebih spesifik dan terarah.', inputLabel: 'Prompt yang ingin diperbaiki', placeholder: 'Tempel prompt asli di sini. Makna dan tujuan utamanya akan dipertahankan.', contextLabel: 'Bagian yang ingin ditingkatkan', contextPlaceholder: 'Misalnya: lebih singkat, kurangi asumsi, hasil harus berbentuk tabel.', action: 'Optimalkan prompt', resultTitle: 'Prompt yang diperbaiki', checklist: ['Tujuan asli tetap terjaga', 'Instruksi lebih spesifik', 'Batasan dan format diperjelas'] },
  { mode: 'prompt_checker', title: 'Prompt Checker', description: 'Periksa kejelasan prompt dan temukan bagian yang masih kurang.', inputLabel: 'Prompt yang akan dievaluasi', placeholder: 'Tempel prompt lengkap yang ingin kamu periksa.', contextLabel: 'Kriteria penilaian', contextPlaceholder: 'Misalnya: kejelasan instruksi, kelengkapan konteks, potensi jawaban melenceng.', action: 'Evaluasi prompt', resultTitle: 'Evaluasi & saran', checklist: ['Bagian yang sudah jelas', 'Ambiguitas dan konteks yang hilang', 'Saran perbaikan yang bisa diterapkan'] },
  { mode: 'humanizer', title: 'AI Humanizer', description: 'Rapikan gaya bahasa agar lebih natural dengan makna tetap terjaga.', inputLabel: 'Teks asli', placeholder: 'Tempel teks yang ingin diubah gaya bahasanya.', contextLabel: 'Pembaca & nada bahasa', contextPlaceholder: 'Misalnya: klien lama, hangat dan profesional, hindari bahasa terlalu formal.', action: 'Rapikan bahasa', resultTitle: 'Teks yang dirapikan', checklist: ['Makna dan fakta tetap terjaga', 'Kalimat lebih mudah dibaca', 'Nada sesuai pembaca'] },
  { mode: 'prompt_reframer', title: 'Prompt Reframer', description: 'Susun ulang instruksi agent dengan format teknis yang tersedia.', inputLabel: 'Tugas untuk agent', placeholder: 'Jelaskan pekerjaan agent, konteks yang tersedia, serta batasan pelaksanaannya.', contextLabel: 'Lingkungan & batasan agent', contextPlaceholder: 'Misalnya: folder kerja, tool yang tersedia, langkah yang harus diverifikasi.', action: 'Susun instruksi agent', resultTitle: 'Instruksi agent', checklist: ['Konteks pekerjaan agent', 'Instruksi terstruktur', 'Bagian hasil dapat disalin terpisah'] },
  { mode: 'prompt_studio', title: 'Prompt Studio', description: 'Siapkan arahan desain untuk AI pintar, lalu instruksi implementasi untuk AI hemat.', inputLabel: '', placeholder: '', contextLabel: '', contextPlaceholder: '', action: '', resultTitle: '', checklist: [] },
  { mode: 'website_prompt', title: 'Website / Coding Prompt', description: 'Tentukan spesifikasi website atau fitur untuk coding assistant.', inputLabel: 'Website atau fitur yang ingin dibuat', placeholder: 'Jelaskan jenis proyek, halaman, fitur utama, serta perilaku yang kamu inginkan.', contextLabel: 'Stack & batasan proyek', contextPlaceholder: 'Misalnya: React + Tailwind, gunakan komponen yang ada, pertahankan login.', action: 'Susun spesifikasi', resultTitle: 'Spesifikasi coding', checklist: ['Halaman, fitur, dan alur pengguna', 'Stack dan batas pekerjaan', 'Responsivitas serta kriteria selesai'] },
  { mode: 'image_prompt', title: 'Image Prompt', description: 'Rancang arahan visual untuk model pembuat gambar.', inputLabel: 'Gambar yang ingin dibuat', placeholder: 'Jelaskan subjek, latar, komposisi, pencahayaan, dan gaya gambar.', contextLabel: 'Media & format gambar', contextPlaceholder: 'Misalnya: foto produk untuk katalog, rasio 4:5, tanpa tulisan.', action: 'Susun prompt gambar', resultTitle: 'Prompt gambar', checklist: ['Subjek dan komposisi', 'Gaya, cahaya, serta suasana', 'Rasio dan detail yang harus dihindari'] },
  { mode: 'video_prompt', title: 'Video Prompt', description: 'Susun urutan adegan dan gerakan untuk generator video.', inputLabel: 'Konsep video', placeholder: 'Jelaskan cerita, subjek, adegan utama, dan gerakan kamera yang diinginkan.', contextLabel: 'Durasi & platform', contextPlaceholder: 'Misalnya: 15 detik, vertikal 9:16, iklan produk untuk Reels.', action: 'Susun prompt video', resultTitle: 'Arahan adegan video', checklist: ['Urutan adegan', 'Gerakan subjek dan kamera', 'Durasi, rasio, serta transisi'] },
  { mode: 'product_swap', title: 'Ganti Produk di Foto', description: 'Gunakan foto referensi sebagai suasana dan foto produk sebagai objek pengganti.', inputLabel: 'Arahan penggantian (opsional)', placeholder: 'Jelaskan posisi produk, pencahayaan, atau detail yang harus dipertahankan.', contextLabel: '', contextPlaceholder: '', action: 'Ganti produk', resultTitle: 'Foto hasil penggantian', checklist: ['Foto referensi menentukan suasana', 'Foto produk menjadi objek pengganti', 'Arahan tambahan mengatur detail'] },
  { mode: 'invoice_items', title: 'Item Invoice', description: 'Uraikan pekerjaan menjadi rincian tagihan yang mudah diperiksa.', inputLabel: 'Pekerjaan atau layanan yang ditagihkan', placeholder: 'Jelaskan deliverable, jumlah, durasi, dan harga jika sudah disepakati.', contextLabel: 'Mata uang & ketentuan harga', contextPlaceholder: 'Misalnya: IDR, total Rp5 juta, harga belum termasuk pajak.', action: 'Rinci item invoice', resultTitle: 'Rincian item tagihan', checklist: ['Deskripsi tiap layanan', 'Jumlah dan satuan', 'Estimasi harga perlu diverifikasi'] },
  { mode: 'proposal_structure', title: 'Proposal Kerja', description: 'Bangun kerangka proposal dengan scope dan deliverable yang jelas.', inputLabel: 'Proyek yang akan ditawarkan', placeholder: 'Jelaskan kebutuhan klien, tujuan proyek, dan layanan yang kamu tawarkan.', contextLabel: 'Timeline & ketentuan kerja', contextPlaceholder: 'Misalnya: 4 minggu, maksimal 2 revisi, anggaran belum ditentukan.', action: 'Susun proposal', resultTitle: 'Kerangka proposal', checklist: ['Tujuan dan latar belakang', 'Scope serta deliverable', 'Timeline dan ketentuan revisi'] },
  { mode: 'follow_up_message', title: 'Follow-up Klien', description: 'Tulis pesan lanjutan yang sesuai konteks percakapan dengan klien.', inputLabel: 'Situasi & percakapan terakhir', placeholder: 'Jelaskan pesan terakhir, waktu berlalu, dan respons yang kamu harapkan.', contextLabel: 'Kanal & nada pesan', contextPlaceholder: 'Misalnya: WhatsApp, sopan dan singkat, tanyakan keputusan proposal.', action: 'Tulis follow-up', resultTitle: 'Pesan untuk klien', checklist: ['Konteks percakapan sebelumnya', 'Nada dan kanal yang sesuai', 'Ajakan merespons yang jelas'] },
]

export const toolGroups: { title: string; modes: GeneratorMode[] }[] = [
  { title: 'Prompt & teks', modes: ['prompt_builder', 'prompt_optimizer', 'prompt_checker', 'humanizer', 'prompt_reframer'] },
  { title: 'Desain & coding', modes: ['prompt_studio', 'website_prompt'] },
  { title: 'Gambar & video', modes: ['image_prompt', 'video_prompt', 'product_swap'] },
  { title: 'Bisnis & klien', modes: ['invoice_items', 'proposal_structure', 'follow_up_message'] },
]

export function composeToolPrompt(input: string, context: string, label: string): string {
  return context.trim() ? `${input.trim()}\n\n${label}:\n${context.trim()}` : input
}
