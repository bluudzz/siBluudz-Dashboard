# Tinjauan Auto Workflow Studio — 27 Oktober 2026

## Penilaian

Fondasi editor cocok untuk menyusun dan menguji alur data serta agent AI secara manual. Koneksi model, Memory, dan Tools dibedakan dari alur data. Eksekusi per node, riwayat, ekspresi terbatas tanpa eval JavaScript, dan pembatasan kuota sudah memberi dasar yang berguna. Produk masih berada pada tahap editor dan pengujian manual, belum menjadi sistem otomasi produksi setara n8n.

Tinjauan ini mengikuti kode terbaru, bukan seluruh fitur yang pernah dibahas dalam chat. Katalog aktif berisi Manual Trigger, Chat Trigger, Atur Data, Split Out, IF, AI Agent, Model AI, Memory, Tools, Cari Informasi, Ambil Halaman/API, dan Persetujuan Manual. Runtime Tools aktif hanya mendukung brief pengetahuan dan penghitung teks. Radar, Search/Fetch MCP lama, serta chatbot bantuan per node belum tersedia; pencarian dan pembacaan URL kini tersedia sebagai node utama yang terpisah. Template Instagram masih memakai agent pratinjau dan gerbang persetujuan; belum membuat gambar atau memublikasikan post.

## Perbaikan yang diterapkan

- Pemeriksaan kesiapan bersama antara editor dan backend. Masalah menunjuk node terkait dan dapat diklik untuk membuka pengaturan.
- Validasi model dan data sebelum permintaan AI; draft belum lengkap tetap bisa disimpan.
- Peringatan untuk node terputus, mode pratinjau, data pin, dan jadwal yang belum aktif.
- Pengujian sebagian memeriksa jalur menuju node tujuan sehingga node sesudahnya boleh belum lengkap.
- Penolakan eksekusi bersamaan untuk workflow pengguna yang sama pada satu proses backend. Run berikutnya boleh segera dimulai setelah run sebelumnya selesai.
- Dokumentasi template Instagram disesuaikan dengan node yang benar-benar tersedia.
- Membuka atau menguji workflow lama tidak lagi menulis ulang graph di database secara otomatis. Node lama tetap tersimpan sampai ada penyimpanan draft secara eksplisit.

## Prioritas berikutnya

1. Jika AI Agent perlu mencari sendiri saat bekerja, sediakan pencarian sebagai Tool AI terkontrol. Sekarang pencarian bekerja sebagai node alur sebelum agent.
2. Tetapkan kontrak hasil agent yang konsisten. Saat ini output umumnya berupa teks dan Split Out mewajibkan struktur prompts yang spesifik; workflow yang lebih umum membutuhkan pemetaan hasil yang jelas.
3. Sediakan pembatalan run dan batas waktu keseluruhan, lalu antrean persisten sebelum menambahkan scheduler produksi. Status run saat ini disimpan dalam memori proses selama eksekusi dan hasil final baru disimpan sesudah selesai.
4. Lengkapi integrasi generator gambar dan publikasi sebagai integrasi tersendiri, termasuk persetujuan manusia sebelum publikasi.
5. Tambahkan strategi migrasi/arsip untuk node lama. Pembacaan sekarang mempertahankan database asli, tetapi penyimpanan draft masih memakai katalog node yang didukung; arsip diperlukan sebelum mengganti konfigurasi lama secara permanen.
6. Pecah komponen editor yang besar setelah perilaku stabil, agar pengaturan node, toolbar, chat, dan riwayat lebih mudah dirawat.

## Verifikasi dan batas

Tes kesiapan memeriksa model kosong, node nonaktif/pin, data tidak valid, Tools, node terputus, dan pengujian sebagian. Tes API memakai database sementara serta provider AI lokal palsu untuk memastikan pemeriksaan berlangsung sebelum panggilan model dan dua permintaan bersamaan tidak menggandakan eksekusi. Pengujian browser mencakup navigasi dari masalah ke Model AI, koreksi model, eksekusi mock, serta tampilan pada lebar 1440, 768, dan 390 piksel. Pengujian ini tidak membuktikan integrasi internet, gambar, atau Instagram sudah aktif.

Seluruh 45 tes lulus dan build produksi berhasil. Tes API diulang setelah perbaikan pembacaan workflow lama dan tetap lulus. Pengukuran visual akhir menghasilkan 0 FAIL dan 2 WARN. Tata letak serta font/palet project dipertahankan; panel pemeriksaan menjadi komponen ringkas di atas kanvas. Peringatan ukuran teks merujuk metadata 11–12px, sedangkan peringatan tinggi panel merujuk ukuran node graph yang berbeda menurut fungsinya. Keduanya dipertahankan karena bukan baris kartu metrik yang harus sama tinggi. Tidak adanya judul h1 tambahan dikecualikan mengikuti permintaan pengguna terdahulu untuk menghapus judul Auto Workflow dan memaksimalkan kanvas. Semua screenshot akhir desktop, tablet, dan ponsel diperiksa; tidak ditemukan overflow halaman.

## Pembaruan node penting

Node Cari Informasi, Ambil Halaman/API, dan Persetujuan Manual telah ditambahkan. Koneksi Google News dan example.com diuji memakai data umum; browser lokal menguji katalog serta alur persetujuan. Persetujuan masih memakai jalankan ulang manual. Batas akses URL dan cara pakai dirinci di docs/workflow-studio.md.
