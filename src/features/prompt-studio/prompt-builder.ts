export interface DesignBrief {
  project: string
  request: string
  context: string
  references: string
  constraints: string
  scope: string
  detail: string
}

export const initialBrief: DesignBrief = {
  project: 'siBluudz Dashboard', request: '', context: '', references: '', constraints: '',
  scope: 'Tampilan dan struktur navigasi', detail: 'Seimbang',
}

function briefText(brief: DesignBrief): string {
  return [
    `Proyek: ${brief.project.trim() || 'Proyek saya'}`,
    `Keinginan: ${brief.request.trim()}`,
    `Cakupan: ${brief.scope}`,
    `Konteks / stack / halaman saat ini: ${brief.context.trim() || 'Belum disertakan; periksa proyek atau minta bukti yang diperlukan.'}`,
    `Referensi visual: ${brief.references.trim() || 'Belum ditentukan; pilih satu arah desain yang sesuai konteks.'}`,
    `Batasan: ${brief.constraints.trim() || 'Pertahankan fungsi, data, autentikasi, API, dan stack yang sudah bekerja.'}`,
  ].join('\n')
}

export function buildArchitectPrompt(brief: DesignBrief): string {
  if (!brief.request.trim()) return ''
  return `Anda adalah arsitek produk dan desainer UI/UX senior. Analisis permintaan saya, tetapkan desain dan struktur, lalu tulis prompt implementasi mandiri untuk AI coding yang hemat. Jangan implementasikan kode aplikasi pada tahap ini.

BRIEF PENGGUNA
${briefText(brief)}

CARA BEKERJA
- Periksa instruksi proyek, struktur file, halaman terkait, komponen, token desain, dan screenshot jika tersedia. Jangan menganggap Anda dapat mengakses repository atau URL hanya karena disebutkan.
- Pisahkan fakta terverifikasi, asumsi, dan informasi yang belum tersedia. Jangan mengarang nama file, perilaku, atau hasil pemeriksaan. Jika bukti penting belum tersedia, minta hanya konteks yang benar-benar menghalangi rancangan.
- Pilih satu arah desain terbaik dan jelaskan alasan singkatnya. Jangan menyerahkan pilihan estetika utama kepada AI pelaksana.
- Hormati cakupan: ${brief.scope}. Jangan memperluas pekerjaan ke fitur atau backend yang tidak diminta.
- Tingkat rincian: ${brief.detail}. ${brief.detail === 'Ringkas' ? 'Utamakan spesifikasi padat, tanpa mengulang konteks.' : brief.detail === 'Sangat detail' ? 'Rinci setiap halaman, komponen, interaksi, dan kriteria penerimaan.' : 'Rinci keputusan penting; ringkas penjelasan pendukung.'}

HASIL YANG HARUS ANDA BERIKAN
1. Audit singkat: masalah konkret, bukti, prioritas, dan hasil yang diinginkan.
2. Rancangan final: peta halaman/navigasi, hierarki informasi, susunan bagian, serta komponen yang dipakai ulang. Nyatakan struktur sebelum → sesudah.
3. Spesifikasi visual: warna dengan nilai pasti, tipografi, ukuran, jarak, grid, radius, dan kontras. Tentukan tata letak desktop, tablet, mobile beserta breakpoint. Ikuti identitas merek; hindari keputusan seperti “buat lebih modern” tanpa ukuran konkret.
4. Perilaku: navigasi, klik, form, validasi, focus keyboard, serta kondisi loading, kosong, error, berhasil, dan disabled yang relevan. Sertakan aksesibilitas dan reduced motion.
5. Rencana perubahan per file atau komponen berdasarkan bukti. Jika lokasi belum diketahui, beri langkah pencarian yang terbatas, bukan path rekaan.
6. PROMPT IMPLEMENTASI FINAL dalam satu blok teks yang bisa disalin. Blok ini wajib mandiri: ulangi brief yang diperlukan, seluruh keputusan desain final, lingkup, batasan, urutan tugas kecil dengan dependensi, dan kriteria selesai yang terukur. Jangan merujuk ke “penjelasan di atas” yang tidak ikut disalin.

ATURAN UNTUK PROMPT IMPLEMENTASI FINAL
- AI hemat bertugas melaksanakan rancangan, bukan mendesain ulang. Bila ada konflik atau spesifikasi penting hilang, laporkan dengan pertanyaan terarah; jangan mengganti arah desain diam-diam.
- Baca hanya file relevan, gunakan komponen/dependensi yang ada, pertahankan perubahan pengguna, dan hindari refactor di luar lingkup.
- Pecah pekerjaan menjadi batch kecil yang bisa diverifikasi. Jangan menulis ulang seluruh proyek. Jangan mengulang audit luas yang sudah dibuktikan.
- Sertakan checklist uji fungsi, build/lint yang tersedia, pemeriksaan screenshot di 1440/768/390 px, tidak ada overflow, serta perbandingan hasil dengan spesifikasi.
- Minta laporan singkat: file berubah, pemeriksaan yang benar-benar dijalankan, dan penyimpangan atau kendala. Jangan mengklaim penghematan token atau pengujian yang tidak diukur.

Keluarkan hasil dalam Bahasa Indonesia. Tujuan: keputusan desain matang dalam satu serah-terima, dengan pekerjaan implementasi yang terarah dan hemat konteks.`
}

export function buildExecutorPrompt(brief: DesignBrief, plan: string): string {
  if (!brief.request.trim() || !plan.trim()) return ''
  return `Anda adalah AI pelaksana untuk proyek berikut. Implementasikan spesifikasi dari AI perancang di bawah secara bertahap.

BRIEF ASLI
${briefText(brief)}

BATAS PELAKSANAAN
- Jadikan rancangan berikut sebagai spesifikasi. Pertahankan keputusan layout, navigasi, warna, ukuran, dan interaksi yang sudah ditetapkan.
- Periksa instruksi repository dan file terkait sebelum mengedit. Verifikasi path; jangan menimpa perubahan pengguna atau mengubah fungsi/data di luar scope.
- Jika rancangan bertentangan dengan brief atau fakta kode, atau belum cukup konkret untuk dikerjakan, jelaskan hambatan dan minta keputusan yang spesifik. Jangan mengarang detail desain penting.
- Kerjakan satu batch kecil pada satu waktu. Gunakan stack dan komponen yang tersedia. Jangan mengulang audit luas, menambah dependensi, atau merancang ulang tanpa alasan kebutuhan.
- Uji fungsi yang berubah dan jalankan build/lint yang tersedia. Periksa desktop, tablet, mobile, akses keyboard, kondisi kosong/error, dan tidak ada overflow. Cocokkan hasil dengan kriteria penerimaan rancangan.
- Laporkan perubahan, hasil uji aktual, dan penyimpangan dengan singkat. Jangan mengklaim tes yang tidak dijalankan.

RANCANGAN DARI AI PERANCANG
${plan.trim()}

Mulai dengan memeriksa file relevan dan melaksanakan batch pertama yang dependensinya sudah terpenuhi.`
}
