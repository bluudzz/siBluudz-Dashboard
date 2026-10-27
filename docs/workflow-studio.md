# Auto Workflow Studio

Editor siBluudz memakai kanvas dengan alur data dan koneksi pendukung AI seperti n8n. Untuk pengguna awam, panel node berisi **Pengaturan** dan **Hasil uji**. Isian umum tampil sebagai form; JSON, ekspresi, dan pengaturan teknis disimpan di bagian lanjutan. Engine dan format JSON tetap milik siBluudz, bukan format impor n8n atau Langflow.

## Kemampuan yang tersedia

- CRUD workflow per pengguna, template, nama draft, penyimpanan sebelum pengujian, konfirmasi saat berpindah draft yang belum disimpan.
- Tambah node melalui katalog, drag/connect, validasi siklus dan koneksi, hapus node/koneksi, duplikasi node, undo/redo (30 perubahan).
- Manual Trigger menerima objek JSON atau array `[{"json":{...}}]`.
- Edit Fields memetakan objek JSON ke tiap item; IF memisahkan item ke output `true` dan `false`. **Persetujuan Manual** menahan cabang setelahnya sampai versi hasil yang masuk disetujui.
- **Cari Informasi** membaca hasil Google News RSS berdasarkan topik dan menyertakan judul, tautan, tanggal, serta sumber. **Ambil Halaman/API** membaca respons teks atau JSON dari URL HTTPS publik menggunakan GET. Keduanya aktif hanya saat workflow diuji; data hasilnya tersimpan di riwayat.
- Ekspresi terbatas `{{ $json.field }}` / `{{ $json.nested.field }}`; nilai ekspresi penuh mempertahankan tipe. Placeholder lama `{field}` tetap diterima. JavaScript arbitrer tidak dievaluasi.
- Execute step menjalankan node tujuan beserta ancestor yang dibutuhkan. Node terputus dan cabang tanpa data dilewati. Error menghentikan langkah berikutnya.
- Nonaktifkan node untuk meneruskan input. Pin output untuk menggunakan data pengujian tetap (IF tidak dapat dipin).
- Hasil per langkah berupa ringkasan yang dapat dibaca, data teknis opsional, status/durasi, log dan riwayat persisten. Data runtime tidak disimpan sebagai konfigurasi workflow.
- Impor/ekspor JSON siBluudz; impor mengganti draft dan bisa di-undo. Maksimal 100 node, 300 koneksi, 1000 item per node, file impor 1 MB.
- Ponsel menampilkan daftar node yang dapat dibuka, sementara desktop/tablet menggunakan kanvas. Menggambar koneksi tersedia di kanvas desktop/tablet.
- Tombol **Cara pakai** di toolbar membuka panduan singkat fungsi node dan langkah membuat template Instagram tanpa menutup kanvas secara permanen.

## Memulai carousel Instagram 3 slide

1. Buka **Cara pakai** lalu pilih **Buat template Instagram**, atau pilih template Instagram saat membuat workflow baru.
2. Pada Manual Trigger, ganti data contoh `topic`, `product`, `audience`, `objective`, `cta`, dan pastikan `slideCount` bernilai `3`. Nilai `factStatus` dimulai dari `needs_review`.
3. Ikuti node sesuai urutan: **Cari Referensi Konten** → **Penentuan Topik** → **Validasi Fakta** → **Strategi Marketing 3 Slide** → **Copywriting** → **Quality Check** → **Persetujuan Manual**. Pencarian internet aktif saat diuji. Agent pada template ini masih pratinjau sampai diaktifkan dan dihubungkan dengan Model AI.
4. Jalankan alur sekali. Node Persetujuan Manual berhenti dan menyimpan bahan masuk dalam riwayat. Buka node tersebut, tinjau hasilnya, klik **Setujui hasil ini**, lalu jalankan ulang. Cabang sesudahnya memakai salinan hasil yang disetujui. Anda bisa mencabut persetujuan untuk meninjau konten baru. Workflow ini belum membuat gambar atau memublikasikan konten.

Persetujuan yang dipilih akan tersimpan bersama draft setelah Anda klik **Simpan** atau **Jalankan alur**. Bila editor dimuat ulang sebelum disetujui, node dapat mengambil bahan terakhir yang menunggu dari riwayat pengujian. Ini adalah gerbang pengujian manual dengan menjalankan ulang dari awal, belum sistem jeda dan lanjut otomatis yang tahan restart.

Topik pencarian dikirim ke Google News. Node Ambil Halaman/API meminta URL yang diisi pengguna atau berasal dari data workflow. Akses dibatasi ke HTTPS publik pada port 443, metode GET, IPv4 publik, tanpa kredensial di URL atau parameter kunci akses umum, tanpa redirect, dengan timeout 10 detik dan respons maksimal 256 KB. Maksimal 10 item input per node internet. Hasil mesin pencari belum otomatis menjadi fakta terverifikasi; tinjau sumber sebelum publikasi. Node Persetujuan Manual sendiri tidak mengirim data ke layanan luar.

## Pemeriksaan sebelum pengujian

Klik **Periksa alur** untuk melihat konfigurasi yang perlu dilengkapi. Klik pesan masalah untuk membuka node terkait. Pemeriksaan mencakup trigger aktif, Model AI yang belum terhubung atau belum dipilih, format bahan awal, Edit Fields, serta pengaturan Tools dan kondisi. Mode pratinjau, node yang terputus, jadwal yang belum aktif, dan penggunaan data pin ditampilkan sebagai catatan.

Pemeriksaan yang sama dijalankan pada backend sebelum eksekusi. Draft yang belum lengkap tetap boleh disimpan. **Uji langkah** hanya memeriksa node tujuan dan jalur sebelumnya; node sesudahnya boleh belum selesai. Workflow yang sedang berjalan menolak permintaan eksekusi kedua agar satu tugas tidak memanggil AI dua kali dari tab berbeda. Perlindungan ini berlaku pada satu proses backend; beberapa replika backend membutuhkan kunci bersama di database atau antrean.

Node ditambahkan melalui satu katalog **Tambah node**. **Siapkan informasi** mengolah data lewat form dan **Buat keputusan** menjadi gerbang persetujuan. Model teks, Memory, dan Tools untuk AI Agent tetap menjadi sumber daya internal AI Agent, bukan langkah utama. Fitur visual, publikasi Instagram, dan script lanjutan tidak ditawarkan pada katalog baru.


## Batas integrasi

AI Agent berjalan menggunakan **OpenAI Agents SDK** (`Agent`, `Runner`, dan `tool`) pada backend siBluudz. Model dipanggil melalui adapter Chat Completions menuju 9router. Agent baru memakai mode aktif; agent lama tetap pratinjau sampai pengguna menekan **Aktifkan AI terhubung**. Hubungkan satu **Model AI**; Memory dan Tools bersifat opsional. Jika memakai alat bantu, pilih model yang mendukung tool calling. Alat yang tersedia adalah pembaca brief (`knowledge`), penghitung karakter/kata (`textLength`). Setiap permintaan model dicatat pada penggunaan kuota AI.

SDK membatasi jumlah putaran, memvalidasi argumen tool, dan mengembalikan hasil beserta penggunaan token. Jejak tool dan statistik pemanggilan disimpan di hasil lokal; tracing eksternal SDK dimatikan. State percakapan tetap disimpan per pengguna dan sesi dalam SQLite.

Toolbar dipadatkan menjadi dua baris: pemilihan workflow / ganti nama / workflow baru dan Simpan / Jalankan, lalu tab Editor / Riwayat beserta Tambah node dan alat kanvas. Nama workflow tidak diulang. Menu tiga titik berisi Impor, Ekspor, dan Hapus workflow.

Kontrol duplikat yang dihapus: deretan shortcut node yang mengulang katalog, template AI Researcher yang mengulang agent dasar, serta form model/peran lama dari tampilan utama AI Agent. Mode preview dan pin data berada di pengaturan lanjutan. Fitur lanjutan tidak ditawarkan pada katalog baru.


## Mencoba chat agent

1. Pilih **Workflow baru → Chat AI Agent · 9router + Memory + Tool**.
2. Buka **9router Chat Model**, lalu pilih model yang mendukung Tools.
3. Isi bahan produk/brand pada **Brief brand**. Pengaturan percakapan boleh memakai nilai bawaan.
4. Klik **Uji chat**, tulis permintaan, dan klik **Kirim**. Draft disimpan sebelum dijalankan.
5. AI Agent memakai pesan sebagai tugas. Koneksi garis utuh membawa data; garis putus menghubungkan Model AI, Memory, dan Tools ke agent.
6. Memory disimpan di SQLite per pengguna, workflow, node Memory, dan kunci sesi. **Sesi baru** memulai konteks baru. Ini adalah chat uji dalam dashboard yang membutuhkan login, belum webhook chat publik.

`.taste-skill/check-agent.mjs` menguji koneksi bertipe, chat melalui endpoint backend, tool calling lewat provider lokal tiruan, pemisahan sesi, riwayat, kepemilikan workflow, dan UI pada tiga lebar layar. Tes ini tidak memanggil provider 9router sungguhan.

## Arah produk dari n8n dan Langflow

siBluudz berfokus pada pekerjaan konten: bahan awal → perencanaan → naskah → pemeriksaan → persetujuan. Form per fungsi menjadi cara mengatur langkah. Kanvas mengatur hubungan antarlangkah. AI Agent pada alur mengerjakan tugas saat dijalankan.

Referensi yang dipelajari:

- [n8n AI Agent](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/): agent dengan koneksi model, memory, dan tool.
- [n8n Chat Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger/): pesan memicu eksekusi.
- [Langflow Components](https://docs.langflow.org/concepts-components): komponen berdasarkan tujuan dan pengaturan umum lebih dulu.
- [Langflow Playground](https://docs.langflow.org/concepts-overview): tempat mencoba percakapan dan memeriksa penggunaan tool.
- [Langflow Assistant](https://docs.langflow.org/langflow-assistant): bantuan penyusunan komponen/alur dari bahasa alami. Bantuan seluruh grafik dapat memakai token lebih besar daripada bantuan satu komponen.

Bantuan seluruh workflow, produksi gambar, scheduler, dan publikasi menjadi pekerjaan terpisah dari perubahan ini. Mengganti engine dengan Langflow memerlukan integrasi layanan Python dan API tersendiri; perubahan ini tidak memasang Langflow.

## Dependensi Agents SDK

Paket backend: `@openai/agents`, `openai`, dan `zod`. OpenAI SDK mendeklarasikan peer opsional Google Auth di bawah v11, sementara aplikasi memakai Google Auth v11 untuk login. Override hanya pada peer opsional OpenAI mempertahankan versi autentikasi aplikasi; adapter agent memakai endpoint 9router dan tidak menggunakan integrasi Vertex/Google milik OpenAI SDK. `npm install --package-lock-only` standar berhasil dengan override tersebut.
