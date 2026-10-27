# 🚀 siBluudz Dashboard

Starter template dashboard modern, cepat, dan responsif yang terinspirasi oleh **shadcn-admin** (`satnaing/shadcn-admin`), dibangun menggunakan standar UI/UX Pro Max.

---

## ✨ Fitur Unggulan

- 🎨 **Shadcn UI Design System**: Komponen berbasis Tailwind CSS v4 dengan palet warna bersih dan modern.
- 🌓 **Dark / Light / System Mode**: Beralih tema secara mulus dengan penyimpanan state otomatis di `localStorage`.
- 📱 **Fully Responsive**: Sidebar desktop yang dapat dilipat (*collapsible*) dan drawer menu untuk perangkat mobile/tablet.
- ⚡ **Command Palette (`Ctrl + K` / `⌘K`)**: Quick navigation & pencarian instan ke seluruh halaman dan fitur.
- 📊 **Visual Charts & KPI Cards**: Komponen visual interaktif untuk analitik metrik dan data performa.
- ⚡ **Auto Workflow (Automation Studio)**: Visual automation drag & drop berbasis node graph (ala n8n) dengan AI Agent, conditional branching, model execution via 9router, serta pengujian per-langkah.
- 🤖 **AI Generator**: Generator teks & prompt terintegrasi dengan 12+ tools, model switcher 9router, ganti produk di foto, dan history sinkronisasi.
- 🧾 **Invoice Workspace & Builder**: Pengelolaan tagihan, penawaran PDF, cetak dokumen, dan editor builder terintegrasi.
- 📬 **Email Manager**: Multi-account mailbox reader dengan dukungan OAuth2 (Microsoft Graph, Gmail) & IMAP TLS serta enkripsi kredensial AES-256-GCM.
- 🧩 **Modular Clean Architecture**: Struktur folder terisolasi, backend Express + SQLite lokal, dan REST API internal.
- ⚡ **Super Fast DX**: Ditenagai oleh Vite + React 19 + TypeScript + Tailwind CSS v4.

---

## 📂 Struktur Direktori

```text
src/
├── components/
│   ├── layout/        # Header, Sidebar, CommandDialog, Navigation
│   └── ui/            # Komponen dasar (Button, Card, Input, Modal)
├── context/           # ThemeContext & global context
├── features/          # Modul workspace terisolasi
│   ├── ai-generator/  # AI prompt generator, tool catalog, image models
│   ├── automation/    # Workflow Studio (Node canvas, node settings, agent runner)
│   ├── invoices/      # Invoice listing, printing & workspace
│   ├── mail/          # Email manager (IMAP/OAuth2 hooks & views)
│   └── prompt-studio/ # Template prompt & testing
├── pages/             # Halaman umum (Overview, Favorites, Settings, Security)
├── types/             # TypeScript schema & definitions
└── App.tsx            # Root application & routing
server/                # Express backend + SQLite (Auth, Automation, Mail, AI API)
shared/                # Workflow engine & connection models
```

---

## 🛠️ Menjalankan di Lokal

### 1. Install Dependensi
```bash
npm install
```

### 2. Jalankan Server Development
```bash
npm run dev
```
Perintah ini akan menjalankan server API backend di port `3001` dan frontend Vite di port `5173`.
Buka browser di: [http://localhost:5173/](http://localhost:5173/)

### 3. Build & Test
```bash
# Jalankan test suite
npm test

# Build production
npm run build
```

---

## 🤖 Auto Workflow Studio

- **Visual Automation Canvas**: Pembuat alur kerja node visual berbasis React Flow (`@xyflow/react`).
- **AI Agent Node**: Menjalankan instruksi AI dengan pilihan model dinamis (integrasi 9router / custom OpenAI-compatible endpoints), tools khusus, dan memori sesi percakapan.
- **Node Catalog**:
  - `Mulai dari Chat (chatTrigger)` & `Jalankan Manual (trigger)`
  - `AI Agent` (otonom & multi-tool)
  - `Atur Data (set)` & `Periksa Kondisi (if)`
  - Sub-node: `Model AI`, `Ingatan percakapan`, `Alat bantu AI`
- **Eksekusi & Uji Langkah**: Pengujian langsung per-node (*Test Step*) atau eksekusi alur penuh dengan riwayat log status, durasi, dan output data.

## AI Generator workspace

- Navigasi 12 tool dikelompokkan; cari tool tanpa menghapus draf yang sedang dikerjakan.
- Desktop menampilkan editor dan hasil berdampingan; layar lebih sempit menumpuk panel, dengan pilihan tool bergulir pada ponsel.
- Enter membuat baris baru. Gunakan **Ctrl + Enter** atau **⌘ + Enter** untuk menjalankan generasi.
- Hasil teks dapat diedit dan disalin. Model dapat dicari, difilter menurut provider, serta disinkronkan dari katalog 9router.
- Riwayat dapat dimuat kembali ke tool asal. Draf tiap tool hanya bertahan selama halaman terbuka; riwayat generasi disimpan melalui API.
- Ganti Produk menerima dua gambar PNG/JPG/WEBP, maksimal 6 MB per gambar. Koneksi dan kuota harus tersedia sebelum generasi.

## Invoice workspace

- Rail kiri memuat halaman (Daftar dokumen, Invoice Builder) dan filter jenis dokumen; isinya hidup di panel kanan.
- Daftar memakai baris ringkas dengan panel detail di samping pada desktop lebar; di bawah 1250px detail turun ke bawah daftar.
- Cari nomor dokumen, klien, atau perihal langsung dari toolbar. Filter dan pencarian tidak mengubah data.
- Tombol **Cetak** hanya mencetak panel detail. **Buka di Builder** meneruskan dokumen ke editor iframe dengan profil dan daftar invoice tersinkron.
- **Reset editor** memuat ulang iframe setelah konfirmasi; perubahan yang belum disimpan akan hilang.
- Perhitungan nominal memakai `src/features/invoices/invoice-utils.ts` (format ribuan Indonesia dan desimal koma). Uji: `npm test`.

## Email Manager workspace

- Rail kiri berisi daftar akun (Outlook Graph, Gmail API, IMAP) dengan penanda token kedaluwarsa; pilih akun untuk memuat inbox-nya.
- Sheet kanan menampilkan daftar inbox dan pembaca email berdampingan di desktop; di bawah 1250px pembaca turun ke bawah daftar.
- Pencarian memfilter subjek, nama pengirim, alamat, dan cuplikan tanpa permintaan ulang ke server.
- Aksi tingkat akun (Cek OTP, Test token, Kredensial, Hapus akun) hanya muncul untuk akun yang sedang aktif.
- Isi email selalu dirender sebagai teks bersih; HTML dari pengirim tidak pernah dieksekusi.
- `npm test` mencakup filter pencarian, label provider, dan format tanggal ringkas.

## 🔐 Local API, Accounts, and SQLite

This project includes a self-hosted Node API and a SQLite database. User credentials are password-hashed; profile, invoices, and sessions are stored in the local `data/sibluudz.sqlite` file and isolated by user ID. Existing browser invoices and the recovered-invoices JSON are not automatically imported into newly registered accounts.

1. Copy `.env.example` to `.env.local`.
2. Set `ADMIN_EMAIL` to the email address that should get the admin role when registering. Leave blank if no admin account is needed.
3. Run `npm install`, then `npm run dev`. This starts the API on port 3001 and Vite on port 5173 together.
4. Open `http://localhost:5173`, choose **Buat Akun**, and register. The configured `ADMIN_EMAIL` is granted the admin role; all other accounts get the user role.

Google login is optional. Create OAuth credentials in Google Cloud, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and add `http://localhost:5173/api/auth/google/callback` as an authorized redirect URI. Restart the API after changing `.env.local`.

### Email Manager (IMAP)

The Email Manager connects to mailbox providers using IMAP over TLS on port 993, verifies credentials before saving, and displays the latest 20 INBOX messages. Use a provider-generated app password where available. Mailbox credentials are encrypted in SQLite using AES-256-GCM; before using this feature, generate a 32-byte key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and set it as `MAIL_CREDENTIALS_KEY` in `.env.local`. Keep this key separate from the database and back it up securely: changing or losing it makes saved mailbox credentials undecryptable. Accounts and messages are scoped to the signed-in user. The inbox reader is read-only and displays message bodies as plain text.

Outlook / Microsoft 365 requires OAuth2 because Microsoft disabled Basic Auth for IMAP in September 2024. Register an app in Microsoft Entra, add `<APP_ORIGIN>/api/mail/oauth/callback` as a Web redirect URI, grant the delegated `IMAP.AccessAsUser.All` scope, then set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in `.env.local`. `<APP_ORIGIN>` must be a valid HTTPS or `http://localhost` redirect. The user then clicks **Hubungkan dengan Microsoft**; only the refresh token is stored (AES-256-GCM encrypted) and access tokens are refreshed in memory on demand.

The local SQLite file is private app data; include it in a secure backup and do not commit it. For production, build with `npm run build`, configure `NODE_ENV=production`, set `APP_ORIGIN` to the public HTTPS origin, then run `npm start` behind an HTTPS reverse proxy. Set `TRUST_PROXY=true` only when the app is behind a trusted reverse proxy. Google OAuth still relies on Google as the identity provider.

This is a private local development setup until deployed on a machine with a stable public address. Static-only hosting such as a frontend-only Vercel or Netlify deployment does not run this SQLite API or host the database file.

---

## 🚀 Cara Menambah Halaman Baru

1. Buat fitur atau halaman baru di dalam `src/features/` atau `src/pages/`.
2. Daftarkan menu pada [src/components/layout/navData.ts](src/components/layout/navData.ts).
3. Buka [src/App.tsx](src/App.tsx) lalu tambahkan `case` di fungsi `renderContent()`.

---

## 🌐 Panduan Deploy

### Deploy ke Vercel
1. Upload folder/repo ini ke GitHub / GitLab.
2. Buka [Vercel Dashboard](https://vercel.com/) dan pilih **Add New Project**.
3. Import repository, Vercel akan otomatis mendeteksi konfigurasi Vite:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Klik **Deploy**.

### Deploy ke Netlify
1. Hubungkan repo ke Netlify.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Klik **Deploy Site**.
