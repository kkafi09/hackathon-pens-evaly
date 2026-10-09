# Bahasa Indonesia dan Inggris

## Perilaku pengguna

Pemilih **ID / EN** di header berlaku untuk Graph, Report, workflow, pertanyaan/kriteria rubrik, kesimpulan, skor, alasan review, tindak lanjut, dialog, dan ekspor Markdown/CSV/PDF tunggal maupun gabungan. Bahasa awal Indonesia. Pilihan disimpan dalam browser pada `evaly-language`; nilai tidak valid kembali ke Indonesia. Elemen HTML mengikuti `lang=id` atau `lang=en`.

Pergantian bahasa tidak me-remount workspace atau memanggil analisis baru. Akun, posisi graph, tab, pencarian, dan pilihan report dipertahankan. Teks buatan aplikasi yang sudah dimuat dapat ditampilkan dalam bahasa lain tanpa menunggu request; respons yang tiba belakangan disajikan sesuai bahasa aktif.

Format angka, tanggal dan persentase memakai `id-ID` atau `en-US`. Mata uang tetap IDR; zona waktu tetap Asia/Bangkok. Brand Evaly dan tagline **Evaluate Your Business Wisely** tetap sama.

## Data asli dan perhitungan

Terjemahan hanya lapisan penyajian setelah validasi. Seluruh 19 ID, tipe, makna kriteria, jawaban asli, bobot, threshold, skor, estimasi, dan status tetap sama. Prompt/request Jev tidak mengikuti bahasa tampilan. Tidak ada panggilan model untuk menerjemahkan.

Email, kutipan, isi tiket, nama akun/kontak, record sumber, kode kategori, dan payload audit tetap utuh. Keterbatasan atau pesan lama yang tidak mempunyai template terjemahan tetap ditampilkan sebagai **Original text** pada bahasa Inggris. Tampilan Indonesia mempertahankan teks tersimpan; penanda tersebut ditampilkan sebagai **Teks asli** bila respons Inggris masih berada di tampilan ketika bahasa diganti.

## API dan ekspor

Endpoint API menerima query opsional `lang=id|en`, default `id`. Bahasa lain ditolak dengan 422 sebelum tindakan dijalankan. Respons dan unduhan menyertakan header `Content-Language`. Contoh:

```text
GET /api/expansion-rubric?lang=en
GET /api/expansion-runs/{run_id}?lang=en
GET /api/expansion-runs?q=C06&lang=en
GET /api/expansion-runs/{run_id}/export/md?lang=en
GET /api/expansion-runs/{run_id}/export/csv?lang=en
GET /api/expansion-runs/{run_id}/export/pdf?lang=en
POST /api/expansion-runs/export/pdf?lang=en
```

Body PDF gabungan tetap `{ "run_ids": ["run-id"] }`. Nama field API dan header kolom CSV tetap sama. Nilai teks milik aplikasi mengikuti bahasa; angka mentah, enum status, record/provenance, dan jawaban model tidak berubah. Panel, Report, serta ekspor memakai jawaban dan aturan kesimpulan yang sama. Replay tidak menulis ulang history. Tidak memerlukan migration atau seeding ulang.

## Pemeliharaan dan pengujian

Katalog bersama berada di `locales/id.json` dan `locales/en.json`, dibaca frontend dan backend. Kunci berupa teks/template Indonesia, dengan placeholder posisi `{0}`, `{1}`, dan seterusnya. Katalog Indonesia memetakan kunci ke teks asli; kunci dan placeholder kedua katalog harus identik. Tambahkan terjemahan pada kedua katalog saat menambahkan teks baru.

Frontend menggunakan fungsi bertipe `t` untuk pesan tetap dan `tx` untuk label yang sudah dimuat. Gunakan `presentText` untuk narasi hasil tersimpan agar teks lama yang tidak dikenali memperoleh penanda teks asli saat tampil dalam bahasa Inggris. Jangan menerapkan keduanya pada isi sumber atau payload audit. Backend menerjemahkan salinan field penyajian yang diperbolehkan melalui `localization.project`, tanpa mengubah objek masukan. Pesan terformat dicocokkan dengan template katalog; teks yang tidak dikenal tidak diterjemahkan dengan tebakan.

Kedua Dockerfile menyertakan katalog; deteksi perubahan `locales/` memilih kedua image. Jalankan pengujian backend, `bun run check`, dan Playwright dengan database khusus pengujian. Uji kedua bahasa, persistensi, pergantian saat proses berjalan, kesamaan nilai/record asli, ekspor, dan pemilih bahasa pada desktop/ponsel serta kedua tema.
