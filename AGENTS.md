# Dashboard Context Graph Evaly

Ikuti `docs/DATA_GUIDE.md` untuk definisi data dan `docs/JEV_ACCOUNT_EXPANSION.md` untuk konsep Jev.

## Rencana dan kontrak produk

- React, TypeScript, Vite, React Flow; backend FastAPI dan MySQL.
- Styling memakai Tailwind CSS 4 melalui plugin Vite. Gunakan token warna light/dark dan utility Tailwind; pertahankan warna peran bukti. Brand produk Evaly: logo lengkap `public/evaly-logo.svg` pada header, ikon `public/evaly-icon.svg` pada favicon, aksen cyan–biru. Logo lengkap tampil tanpa latar tambahan pada kedua tema. Dark mode menggunakan `public/evaly-logo-dark.svg` dengan tulisan putih; light mode menggunakan tulisan biru asli. Warna ikon tetap sama. Dataset sumber tetap KasirNusa. Tema awal mengikuti sistem, pilihan pengguna disimpan lokal; React Flow mengikuti tema yang sama.
- Graph awal 45 akun beserta owner; graph fokus memperlihatkan record sumber untuk akun terpilih.
- Klik akun membuka menu mengambang berisi lima kasus. Empat dikunci; Account Expansion aktif hanya untuk 40 pelanggan.
- Workflow di panel kanan: konteks -> Choice klasifikasi -> Score niat -> Noul tiket -> perhitungan kode dan Choice tindakan.
- Membuka panel tidak memanggil Jev. Tombol analisis baru menjalankan API; hasil tersimpan dibuka dengan label replay.
- Tidak ada hasil palsu atau fallback simulasi. API key hanya di backend. Data asli tidak diedit.
- Seeder menggunakan `data/dataset_kasirnusa` sebagai sumber tunggal; snapshot 1 Oktober 2026. Runtime membaca dataset aktif dari MySQL.
- Confidence bukan probabilitas deal menang. Pisahkan fakta, penilaian Jev, dan skenario perhitungan.
- Tidak ada pertanyaan deteksi ekspansi terpisah yang menggandakan klasifikasi/niat.
- Output menyertakan sumber, record ID, model aktual, versi rubrik, hash dataset, waktu, distribusi, dan asumsi.
- Tiket bukan otomatis penghambat. Tidak boleh menjanjikan fitur/upgrade/diskon yang tidak didukung data.
- Empat fitur terkunci: Churn Early Warning Graph, Decision Maker Discovery, Relationship Path Finder, Deal Acceleration.

## Struktur dan verifikasi

Backend pada `backend/`, frontend pada `src/`, pengujian UI pada `e2e/`. Cara menjalankan dan batasan ada di README.

Gunakan Bun sebagai package manager dan script runner frontend. Simpan dependency pada `bun.lock`; jangan membuat `package-lock.json`. Oxlint digunakan untuk lint (`bun run lint`, `bun run lint:fix`), Oxfmt untuk format (`bun run format`, `bun run format:check`). Konfigurasi pada `.oxlintrc.json` dan `.oxfmtrc.json`; formatter hanya mencakup frontend, konfigurasi, dan dokumentasi dashboard, bukan backend Python atau dataset.

Jalankan `python -m pytest backend/tests -q`, `bun run check` (lint, format check, dan build), serta `bun run test:e2e` setelah perubahan relevan. Gunakan environment virtual lokal. Jangan menyimpan API key atau database hasil dalam source control. Pertahankan respons terkontrol hanya dalam pengujian; jangan memasukkannya ke history dashboard produksi.

## Integrasi dan provenance

Analisis baru wajib melalui OpenRouter System One (`https://openrouter.ai/api/v1/systemone`), key `OPENROUTER_API_KEY`, model default `~typesafe/jev-latest` melalui `OPENROUTER_MODEL`. Jangan fallback ke key TypeSafe atau hasil simulasi. Simpan gateway dan model aktual; hasil lama tanpa gateway dianggap TypeSafe.

Provenance merekam snapshot semua record yang dikirim sebelum memanggil model. Bedakan input yang dievaluasi dengan bukti pendukung hasil. Highlight graph hanya memakai node/relasi yang tersedia; snapshot tanpa node tetap dibaca di panel. Warna ungu untuk ekspansi, biru perhitungan, kuning konteks. Kutipan harus merupakan substring sumber asli. Jangan mengklaim mengetahui alasan internal Jev atau menjadikan Noul sebagai label penghambat otomatis.

## Hasil yang mudah dibaca dan penghapusan

Penjelasan review dan langkah berikutnya berasal dari keputusan tersimpan melalui template kode, tanpa model tambahan. Pertahankan aturan review dan batas confidence 60%; bedakan confidence, probabilitas pilihan, dan catatan bisnis. Simpan review_reasons/next_steps pada run baru; turunkan pada pembacaan hasil lama tanpa menulis ulang history. Jangan mengarang jadwal, harga upgrade, approval, atau komitmen pelanggan.

Kesimpulan v2 memakai `validation_summary` dengan aturan `validation-v1.0`; OI-3 dan confidence niat hanya di detail parameter. Ikuti aturan status, estimasi dan bukti lintas sumber dalam RUBRIK_EVALUASI.md. Satu sumber boleh selesai dengan catatan; jawaban negatif bukan otomatis review. Panel, report, ekspor dan replay harus menampilkan kesimpulan konsisten tanpa menulis ulang history.

Skor gabungan memakai `result.expansion_score` dan `expansion-score-v1.0`; ikuti `docs/EXPANSION_SCORE.md`. Pertahankan 19 parameter asli. Semua nilai, bobot, pembatas dan sumber harus dapat ditelusuri. Skor bukan probabilitas menang dan tidak menghapus status review. Pipeline yang memenuhi syarat netral dikeluarkan dari pembagi; parameter wajib yang hilang tidak boleh dianggap tidak berlaku.

Penghapusan satu hasil wajib memakai konfirmasi berisi akun, waktu dan status. Hanya done/review/failed dapat dihapus. Pemeriksaan status dan DELETE dilakukan dalam satu transaksi MySQL dengan SELECT FOR UPDATE; waiting/running ditolak. Setelah hasil aktif dihapus, kosongkan hasil dan highlight, pertahankan akun serta posisi graph. Pengujian penghapusan menggunakan database sementara atau route terkontrol, tidak menghapus history produksi.

## Deployment dan database

DATABASE_URL harus MySQL, tanpa fallback SQLite. Dataset salinan hanya dipakai seeder. Alembic dan python -m backend.seed dijalankan manual melalui docker exec -it, bukan startup atau CI produksi. Seeder harus transaksional, idempoten dan tidak mengubah riwayat. Pertahankan byte sumber agar hash tidak berubah.

Health live tidak mengakses database/OpenRouter; health ready memeriksa koneksi, revision schema dan dataset aktif. Container tetap hidup sebelum migration/seed. Backend satu worker/satu instance dengan stop-first deployment setelah analisis aktif selesai. Tes memakai TEST_DATABASE_URL dengan nama database berakhiran _test; jangan mengubah produksi. Instruksi lengkap pada DEPLOYMENT.md.
