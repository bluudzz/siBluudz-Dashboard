# OpenCode worker untuk siBluudz Dashboard

Worker berjalan di folder project ini dan memakai model `ninerouter/ag/gemini-3.8-flash` melalui konfigurasi OpenCode lokal. Jendela terminal menampilkan tugas yang masuk, aktivitas tool, jawaban AI, dan hasil akhir. Satu worker hanya mengerjakan satu tugas dalam satu waktu.

## Perintah

Jalankan dalam terminal yang tetap terbuka:

```powershell
npm run worker:run
```

Tambahkan tugas dari chat ini atau terminal lain:

```powershell
node scripts/opencode-worker.mjs enqueue "Periksa komponen X, perbaiki masalah Y, lalu jalankan tes yang relevan."
```

Lihat laporan singkat:

```powershell
npm run worker:status
```

Antrean dan log berada di `data/opencode-worker/` yang diabaikan Git. ChatGPT dapat menulis tugas dan membaca status dari folder project yang sama selama chat aktif. Worker tidak mengirim pesan otomatis ke chat saat tugas selesai; minta ChatGPT memeriksa status atau lanjutkan percakapan untuk meninjau hasil. Jendela worker harus tetap berjalan agar tugas berikutnya diambil.

Jangan menjalankan dua worker sekaligus pada folder yang sama. Jangan mengedit file yang sama secara bersamaan dengan worker. Jika OpenCode perlu akses profil pengguna, jalankan terminal worker dengan izin yang sama seperti instalasi OpenCode biasa.
