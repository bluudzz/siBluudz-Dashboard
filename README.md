# 🚀 siBluudz Dashboard

Starter template dashboard modern, cepat, dan responsif yang terinspirasi oleh **shadcn-admin** (`satnaing/shadcn-admin`), dibangun menggunakan standar UI/UX Pro Max.

---

## ✨ Fitur Unggulan

- 🎨 **Shadcn UI Design System**: Komponen berbasis Tailwind CSS v4 dengan palet warna bersih dan modern.
- 🌓 **Dark / Light / System Mode**: Beralih tema secara mulus dengan penyimpanan state otomatis di `localStorage`.
- 📱 **Fully Responsive**: Sidebar desktop yang dapat dilipat (*collapsible*) dan drawer menu untuk perangkat mobile/tablet.
- ⚡ **Command Palette (`Ctrl + K` / `⌘K`)**: Quick navigation & pencarian instan ke seluruh halaman dan fitur.
- 📊 **Visual Charts & KPI Cards**: Komponen visual interaktif untuk analitik metrik dan data performa.
- 🧩 **Modular Clean Architecture**: Struktur folder terisolasi, siap diintegrasikan dengan REST API, Supabase, Firebase, atau Prisma.
- ⚡ **Super Fast DX**: Ditenagai oleh Vite + React 19 + TypeScript.

---

## 📂 Struktur Direktori

```text
src/
├── components/
│   ├── layout/
│   │   ├── Header.tsx         # Topbar (pencarian, tema, notifikasi, profil)
│   │   ├── Sidebar.tsx        # Navigasi samping (collapsible & mobile-ready)
│   │   ├── CommandDialog.tsx  # Modal pencarian cepat (Ctrl + K)
│   │   └── navData.ts         # Konfigurasi menu navigasi terpusat
│   └── ui/                    # Komponen atomik (Button, Card, Badge, Avatar, Input)
├── context/
│   └── ThemeContext.tsx       # State manajemen tema (Light / Dark / System)
├── pages/                     # Halaman modular (Overview, Analytics, Customers, dll.)
├── types/                     # Definisi TypeScript
├── App.tsx                    # Layout utama & router
└── index.css                  # Konfigurasi Tailwind CSS v4 & theme variables
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
Buka browser di: [http://localhost:5173/](http://localhost:5173/)

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

### 3. Build untuk Produksi
```bash
npm run build
```
Hasil build akan berada di folder `dist/` dan siap dideploy.

---

## 🚀 Cara Menambah Halaman Baru

1. Buat file baru di dalam `src/pages/` (contoh: `MyCustomPage.tsx`).
2. Buka [src/components/layout/navData.ts](src/components/layout/navData.ts) lalu tambahkan item baru dengan id unik.
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
