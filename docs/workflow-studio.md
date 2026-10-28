# Auto Workflow Studio

Editor siBluudz memakai kanvas dengan alur data dan koneksi pendukung AI seperti n8n. Untuk pengguna awam, panel node berisi **Pengaturan** dan **Hasil uji**. Isian umum tampil sebagai form; JSON, ekspresi, dan pengaturan teknis disimpan di bagian lanjutan. Engine dan format JSON tetap milik siBluudz, bukan format impor n8n atau Langflow.

## Kemampuan yang tersedia

- CRUD workflow per pengguna, template, nama draft, penyimpanan sebelum pengujian, konfirmasi saat berpindah draft yang belum disimpan.
- Tambah node melalui katalog, drag/connect, validasi siklus dan koneksi, hapus node/koneksi, duplikasi node, undo/redo (30 perubahan).
- Manual Trigger menerima objek JSON atau array `[{"json":{...}}]`.
- **Prompt Trigger** memulai alur dari satu perintah teks. Mode bawaan **AI** memakai model utama 9router atau model yang dipilih di node, lalu meneruskan jawabannya sebagai `prompt` dan `output` ke langkah berikutnya; perintah awal tersimpan sebagai `originalPrompt`. **Mode Normal** meneruskan prompt tanpa memanggil AI. Kedua mode dijalankan saat tombol **Jalankan alur** atau **Uji langkah** ditekan, bukan saat mengetik.
- Edit Fields memetakan objek JSON ke tiap item; IF memisahkan item ke output `true` dan `false`. **Persetujuan Manual** menahan cabang setelahnya sampai versi hasil yang masuk disetujui.
- **Riset Informasi** dapat menyusun pencarian topik lalu membaca banyak halaman publik, atau membaca satu URL HTTPS langsung. Node lama **Ambil Halaman/API** tetap dapat dijalankan pada workflow lama, tetapi tidak ditawarkan lagi untuk workflow baru.
- **Generate Gambar** membuat satu gambar per item memakai model gambar 9router. Rasio dan ukuran ditulis pada prompt dari langkah sebelumnya; node tidak meminta ukuran tersendiri. PNG hasil model dikonversi menjadi JPEG. Hasil gambar tampil sebagai pratinjau di panel Hasil dan Persetujuan Manual. **Post to Instagram** dapat menerbitkan satu foto atau carousel 2–10 foto melalui Meta API, membaca daftar post, dan memeriksa satu post. Semua node memiliki ikon di katalog dan kanvas.
- Ekspresi terbatas `{{ $json.field }}` / `{{ $json.nested.field }}`; nilai ekspresi penuh mempertahankan tipe. Placeholder lama `{field}` tetap diterima. JavaScript arbitrer tidak dievaluasi.
- Execute step menjalankan node tujuan beserta ancestor yang dibutuhkan. Node terputus dan cabang tanpa data dilewati. Error menghentikan langkah berikutnya.
- Nonaktifkan node untuk meneruskan input. Pin output untuk menggunakan data pengujian tetap (IF tidak dapat dipin).
- Hasil per langkah berupa ringkasan yang dapat dibaca, data teknis opsional, status/durasi, log dan riwayat persisten. Data runtime tidak disimpan sebagai konfigurasi workflow.
- Selama pengujian, editor menampilkan status node secara langsung: **Menunggu giliran** sesaat setelah alur dimulai, **Sedang diproses…** pada node yang sedang berjalan (border putus-putus dan indikator berkedip), lalu **Selesai**, **Dilewati**, **Error**, atau **Menunggu persetujuan**. Panel status di kanan atas menampilkan nama node aktif dan jumlah node yang sudah selesai. Nilai ini berasal dari endpoint `GET /api/workflows/:id/active` yang di-polling tiap 250 ms, jadi bukan tebakan sisi klien.
- Impor/ekspor JSON siBluudz; impor mengganti draft dan bisa di-undo. Maksimal 100 node, 300 koneksi, 1000 item per node, file impor 1 MB.
- Ponsel menampilkan daftar node yang dapat dibuka, sementara desktop/tablet menggunakan kanvas. Menggambar koneksi tersedia di kanvas desktop/tablet.
- Tombol **Cara pakai** di toolbar membuka panduan singkat fungsi node dan langkah membuat template Instagram tanpa menutup kanvas secara permanen.

## Memulai carousel Instagram 3 slide

1. Buka **Cara pakai** lalu pilih **Buat template Instagram**, atau pilih template Instagram saat membuat workflow baru.
2. Pada Manual Trigger, ganti data contoh `topic`, `product`, `audience`, `objective`, `cta`, dan pastikan `slideCount` bernilai `3`. Nilai `factStatus` dimulai dari `needs_review`.
3. Ikuti node sesuai urutan: **Cari Referensi Konten** → **Penentuan Topik** → **Validasi Fakta** → **Strategi Marketing 3 Slide** → **Copywriting** → **Quality Check** → **Persetujuan Manual**. Pencarian internet aktif saat diuji. Agent pada template ini masih pratinjau sampai diaktifkan dan dihubungkan dengan Model AI.
4. Hubungkan **Generate Gambar** setelah prompt slide disiapkan. Hubungkan **Persetujuan Manual** setelah Generate Gambar agar Anda meninjau gambar dan caption yang akan dikirim. Setelah itu, hubungkan **Post to Instagram**.
5. Jalankan alur sekali. Persetujuan Manual menyimpan bahan masuk dan menahan publikasi. Buka node itu, tinjau gambar dan caption, klik **Setujui hasil ini**, lalu jalankan ulang. Node Instagram hanya berjalan setelah persetujuan yang benar-benar dijalankan.

## Menghubungkan Instagram di VPS

1. Isi `SOCIAL_CREDENTIALS_KEY` dengan kunci acak 32 byte base64. Isi `PUBLIC_BASE_URL` dengan origin HTTPS dashboard, misalnya `https://dashboard.example.com`, lalu restart backend. Jangan ubah kunci setelah akun disimpan karena token lama tidak dapat didekripsi.
2. Di node **Post to Instagram**, klik **Hubungkan akun**. Isi username, misalnya `@bluudzstore`, dan tempel token Meta. ID akun ditemukan dari Page pemilik token, daftar Page yang dikelola, atau profil Instagram Login. Akun di luar akses token tidak bisa dipilih hanya dengan username. **Pengaturan lanjutan** menyediakan jenis token dan ID manual jika pencarian gagal; username tetap diperiksa agar tidak terhubung ke akun yang salah. Backend menyimpan token terenkripsi dan memperbarui koneksi yang sudah ada untuk akun yang sama.
3. Pilih akun itu di node. Aplikasi memeriksa akses baca dan izin token tanpa menerbitkan konten. Tindakan yang dapat digunakan berada di bagian atas dropdown; tindakan tanpa akses atau belum didukung berwarna abu-abu dengan alasan di **Lihat akses**. Saat ini node menyediakan publikasi foto/carousel, daftar post, dan detail satu post. Publikasi memerlukan `instagram_content_publish` (Facebook Login) atau `instagram_business_content_publish` (Instagram Login). Izin yang tidak dapat diperiksa tidak dianggap tersedia. Sebagian Page token memerlukan `META_APP_ACCESS_TOKEN` dari aplikasi Meta yang sama di server agar daftar izin bisa dibaca. Tombol periksa ulang menyegarkan akses; backend memeriksa lagi sebelum menjalankan tindakan.
4. Saat terbit, node membaca `imageUrl` dan `caption` dari langkah sebelumnya bila isian opsional dikosongkan. Untuk carousel, setiap item masuk menjadi satu slide. Gunakan 1–10 gambar JPEG di URL HTTPS publik. Reel, Story, komentar, pesan, statistik, dan penghapusan post belum dijalankan oleh node ini dan ditampilkan sebagai fitur belum didukung. Adanya izin token tidak otomatis berarti semua fitur tersebut sudah diimplementasikan.
5. Alamat gambar yang dibuat aplikasi berisi token acak. Meta perlu mengambilnya tanpa login; siapa pun yang memiliki tautan juga bisa melihat gambar. Pastikan domain VPS dapat diakses Meta dari internet. Publikasi tidak diuji dengan akun sungguhan di lingkungan pengembangan.

Jika respons Meta gagal setelah permintaan publikasi dimulai, node menahan percobaan ulang untuk konten yang sama sampai Anda memeriksa akun Instagram. Ini mencegah post ganda ketika status permintaan tidak pasti. **Lepas koneksi** hanya menghapus token dari dashboard. Penghapusan post terbit melalui API belum ditawarkan karena endpoint resmi yang sesuai untuk kedua jalur login belum terverifikasi; hapus post lewat aplikasi Instagram.

Persetujuan yang dipilih akan tersimpan bersama draft setelah Anda klik **Simpan** atau **Jalankan alur**. Bila editor dimuat ulang sebelum disetujui, node dapat mengambil bahan terakhir yang menunggu dari riwayat pengujian. Ini adalah gerbang pengujian manual dengan menjalankan ulang dari awal, belum sistem jeda dan lanjut otomatis yang tahan restart.

Mode pencarian memakai AI 9router untuk menyusun hingga lima sudut riset dari topik node sebelumnya. Bing RSS dan Google News RSS memberi kandidat sumber untuk setiap sudut; node membagi jatah baca antarsudut, menyaring duplikat, dan mencari lagi bila sumber yang berhasil dibaca atau ragamnya masih kurang. Batas halaman diatur pada node (default 12, maksimal 20). Hasil mencatat sumber yang terbaca, sumber yang gagal, domain, sudut riset, dan kueri lanjutan. Jika tersedia layanan SearXNG pada alamat HTTPS publik, set `RESEARCH_SEARXNG_URL=https://search.example.com` di backend untuk menambah sumber hasil pencarian melalui API JSON; tidak perlu memasang SearXNG pada VPS dashboard yang sama. Bila konektor itu gagal, pencarian RSS tetap berjalan. Mode URL langsung meminta alamat yang diisi pengguna atau berasal dari data workflow. Akses dibatasi ke HTTPS publik, metode GET, tanpa kredensial di URL, tanpa redirect, serta dengan batas waktu dan ukuran respons. Maksimal 10 item input per node internet. Hasil pencarian belum otomatis menjadi fakta terverifikasi; tinjau sumber sebelum publikasi.

## Pemeriksaan sebelum pengujian

Klik **Periksa alur** untuk melihat konfigurasi yang perlu dilengkapi. Klik pesan masalah untuk membuka node terkait. Pemeriksaan mencakup trigger aktif, Model AI yang belum terhubung atau belum dipilih, format bahan awal, Edit Fields, pencarian informasi, dan kondisi. Mode pratinjau, node yang terputus, jadwal yang belum aktif, dan penggunaan data pin ditampilkan sebagai catatan.

Pemeriksaan yang sama dijalankan pada backend sebelum eksekusi. Draft yang belum lengkap tetap boleh disimpan. **Uji langkah** hanya memeriksa node tujuan dan jalur sebelumnya; node sesudahnya boleh belum selesai. Workflow yang sedang berjalan menolak permintaan eksekusi kedua agar satu tugas tidak memanggil AI dua kali dari tab berbeda. Perlindungan ini berlaku pada satu proses backend; beberapa replika backend membutuhkan kunci bersama di database atau antrean.

Node ditambahkan melalui satu katalog **Tambah node**. Model teks dan Memory menjadi sumber daya internal AI Agent. Pencarian internet dilakukan oleh node **Riset Informasi**. Generate Gambar dan Post to Instagram tersedia pada kategori AI dan Publikasi. Script lanjutan belum tersedia.


## Batas integrasi

AI Agent berjalan menggunakan **OpenAI Agents SDK** pada backend siBluudz dan model dipanggil melalui adapter Chat Completions menuju 9router. Hubungkan satu **Model AI**; Memory bersifat opsional. Aturan AI menentukan perilaku tetap agent, sedangkan Memory menyimpan percakapan sebelumnya dalam sesi yang sama. Riset web berada pada node terpisah agar tidak menghabiskan putaran tool AI Agent. Setiap permintaan model dicatat pada penggunaan kuota AI.

## Google Drive di Auto Workflow

Node **Google Drive** dapat memakai link berbagi file atau folder. Link file memilih file itu langsung; link folder dapat memilih gambar JPEG/PNG secara acak atau berdasarkan sebagian nama file. Pemilihan folder memeriksa maksimal 300 gambar yang dapat diakses akun terhubung. Link yang mengandung `resourcekey` didukung. Akun Google yang dipilih tetap harus memiliki akses ke tautan tersebut. Node ini juga dapat mencari daftar file, melihat detail, dan mengunduh file biasa hingga 12 MB. Untuk file JPEG/PNG, tindakan **Pilih dari link berbagi** atau **Unduh** membuat salinan JPEG di penyimpanan media workflow dan meneruskan `imageUrl` ke langkah berikutnya. Hubungkan **Google Drive → Persetujuan Manual → Post to Instagram** untuk meninjau gambar sebelum publikasi. Meta mengambil gambar dari URL HTTPS bertoken yang dibuat aplikasi; URL unduh privat Google tidak dikirim ke Meta. Google Docs/Sheets/Slides belum diekspor oleh node ini.

Di Google Cloud, aktifkan Drive API dan daftarkan redirect URI `https://DOMAIN_ANDA/api/google-drive/callback` untuk OAuth Web client. Set `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `APP_ORIGIN`, `PUBLIC_BASE_URL`, dan `SOCIAL_CREDENTIALS_KEY` di server. Scope `drive.readonly` memberi izin melihat dan mengunduh semua file Drive akun yang terhubung; Google menggolongkannya sebagai restricted scope dan mungkin meminta proses verifikasi aplikasi untuk pemakaian produksi di luar daftar pengguna uji. Token refresh disimpan terenkripsi dan terikat ke akun website yang sedang login.

SDK membatasi jumlah putaran, memvalidasi argumen tool, dan mengembalikan hasil beserta penggunaan token. Jejak tool dan statistik pemanggilan disimpan di hasil lokal; tracing eksternal SDK dimatikan. State percakapan tetap disimpan per pengguna dan sesi dalam SQLite.

Toolbar dipadatkan menjadi dua baris: pemilihan workflow / ganti nama / workflow baru dan Simpan / Jalankan, lalu tab Editor / Riwayat beserta Tambah node dan alat kanvas. Nama workflow tidak diulang. Menu tiga titik berisi Impor, Ekspor, dan Hapus workflow.

Kontrol duplikat yang dihapus: deretan shortcut node yang mengulang katalog, template AI Researcher yang mengulang agent dasar, serta form model/peran lama dari tampilan utama AI Agent. Mode preview dan pin data berada di pengaturan lanjutan. Fitur lanjutan tidak ditawarkan pada katalog baru.


## Mencoba chat agent

1. Pilih **Workflow baru → AI Agent · Model dan Memory**.
2. Buka **9router Chat Model**, lalu pilih model teks.
3. Isi bahan produk/brand pada **Brief brand**. Pengaturan percakapan boleh memakai nilai bawaan.
4. Klik **Uji chat**, tulis permintaan, dan klik **Kirim**. Draft disimpan sebelum dijalankan.
5. AI Agent memakai pesan sebagai tugas. Koneksi garis utuh membawa data; garis putus menghubungkan Model AI dan Memory ke agent.
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

Bantuan seluruh workflow dan scheduler menjadi pekerjaan terpisah. Mengganti engine dengan Langflow memerlukan integrasi layanan Python dan API tersendiri; perubahan ini tidak memasang Langflow.

## Dependensi Agents SDK

Paket backend: `@openai/agents`, `openai`, dan `zod`. OpenAI SDK mendeklarasikan peer opsional Google Auth di bawah v11, sementara aplikasi memakai Google Auth v11 untuk login. Override hanya pada peer opsional OpenAI mempertahankan versi autentikasi aplikasi; adapter agent memakai endpoint 9router dan tidak menggunakan integrasi Vertex/Google milik OpenAI SDK. `npm install --package-lock-only` standar berhasil dengan override tersebut.
