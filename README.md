<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/evaly-logo-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="./public/evaly-logo.svg" />
    <img src="./public/evaly-logo.svg" alt="Evaly" width="280" />
  </picture>
</p>

<h1 align="center">Setiap koneksi, sebuah peluang.</h1>

<p align="center">
  Jelajahi konteks pelanggan. Temukan peluang ekspansi. Telusuri bukti di balik setiap hasil.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Bun-1.4-14151A?style=flat-square&logo=bun&logoColor=white" alt="Bun 1.4" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL 8" />
</p>

<p align="center">
  <a href="#fitur-utama">Fitur</a> ·
  <a href="#cara-kerja">Workflow</a> ·
  <a href="#mulai-lokal">Mulai lokal</a> ·
  <a href="#dokumentasi">Dokumentasi</a> ·
  <a href="#pengujian-dan-batasan">Pengujian</a>
</p>

---

## Tentang Evaly

Evaly membantu tim account management dan sales menjawab **“Di mana peluang pertumbuhan dari pelanggan yang ada?”** melalui context graph yang menghubungkan percakapan, kontak, kontrak, usage, dan tiket.

Jev melalui OpenRouter menilai sinyal ekspansi dan niat pelanggan. Kode menghitung estimasi nilai, sementara graph membantu menelusuri sumbernya. Hasil menyajikan peluang, hal yang perlu dikonfirmasi, dan tindakan berikutnya.

Dataset KasirNusa mencakup **40 pelanggan, 5 prospek, dan 620 outlet**, dengan snapshot 1 Oktober 2026. Account Expansion tersedia untuk pelanggan existing; empat track lainnya masih terkunci.

## Fitur utama

| Fitur                           | Yang bisa dilakukan                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Context graph**               | Cari akun, jelajahi relasi, dan buka konteks pelanggan tanpa kehilangan posisi kanvas.           |
| **Account Expansion**           | Jalankan klasifikasi interaksi, penilaian niat, pemeriksaan tiket, dan rekomendasi tindakan.     |
| **Bukti yang dapat ditelusuri** | Bedakan data yang dievaluasi dan bukti pendukung hasil; buka pesan, kontrak, serta kutipan asli. |
| **Hasil yang mudah dibaca**     | Lihat kesimpulan, alasan perlu ditinjau, langkah berikutnya, dan formula estimasi nilai.         |
| **Riwayat dan ekspor**          | Buka kembali snapshot hasil, ekspor Markdown/CSV, atau hapus satu hasil dengan konfirmasi.       |
| **Terang dan gelap**            | Tema mengikuti perangkat atau pilihan pengguna, dengan logo dan warna bukti yang menyesuaikan.   |

## Cara kerja

**Pilih akun → Jalankan analisis → Telusuri bukti → Tindak lanjut**

1. Klik akun pada graph, lalu pilih **Account Expansion**. Membuka panel belum memanggil Jev.
2. Pilih **Jalankan analisis baru** atau **Lihat hasil tersimpan**. Replay menampilkan waktu evaluasi asli tanpa panggilan model baru.
3. Ikuti tahap workflow, lalu buka **Hasil analisis** untuk membaca kesimpulan, alasan review, estimasi nilai, dan tindakan berikutnya.
4. Klik bukti untuk membuka record dan menyorot graph. Gunakan **Fokus bukti** jika ingin memusatkan kanvas, lalu ekspor ringkasan untuk tindak lanjut.

<details>
<summary><strong>Di balik workflow: konteks, Jev, dan perhitungan</strong></summary>

| Tahap                     | Peran                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Kumpulkan konteks**     | Ambil record akun dan ringkasan usage dari dataset aktif MySQL.                                                                           |
| **Choice — klasifikasi**  | Kategorikan interaksi sebagai ekspansi, keluhan, renewal, lainnya, atau tidak jelas.                                                      |
| **Score — niat**          | Nilai pesan ekspansi pelanggan dan thread terkait: belum ada niat eksplisit, eksplorasi, rencana konkret, atau permintaan penawaran.      |
| **Noul — tiket**          | Periksa apakah bukti secara eksplisit menyatakan masalah harus selesai sebelum ekspansi. Tiket terbuka tidak otomatis menjadi penghambat. |
| **Kode + Choice — hasil** | Ambil kandidat jumlah outlet, pilih angka yang didukung konteks, hitung nilai, dan tentukan tindakan berikutnya.                          |

Ungu menandai bukti ekspansi/thread, biru dasar perhitungan, dan kuning konteks atau informasi yang perlu dikonfirmasi. Highlight menunjukkan peran sumber dalam workflow, bukan proses berpikir internal model.

Run menyimpan snapshot bukti, respons Jev, model aktual, gateway, versi rubrik, waktu, dan hash dataset. Hasil lama memakai informasi yang memang tersimpan; keterbatasan provenance ditampilkan bila ada.

</details>

## Mulai lokal

**Prasyarat:** Bun 1.4.2+, Node.js 22+, Python 3.12+, dan MySQL 8+ dengan schema serta pengguna aplikasi yang sudah dibuat.

Jalankan dari root repositori Evaly. Pada workspace induk, masuk ke folder `03 Dashboard` terlebih dahulu. Contoh berikut menggunakan PowerShell di Windows.

### 1. Pasang dependency

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
bun install --frozen-lockfile
Copy-Item .env.example .env
```

### 2. Atur konfigurasi backend

Isi `.env` dengan koneksi MySQL dan key OpenRouter milik Anda:

```dotenv
DATABASE_URL=mysql+pymysql://USER:PASSWORD@127.0.0.1:3306/evaly?charset=utf8mb4
OPENROUTER_API_KEY=
OPENROUTER_MODEL=~typesafe/jev-latest
```

Ganti `USER` dan `PASSWORD`; URL-encode karakter khusus pada password. Key hanya dibaca backend dan `.env` dikecualikan dari Git. Restart backend setelah mengubah konfigurasi.

Key diperlukan untuk **analisis baru**. Graph, konteks data, dan hasil tersimpan dapat dibuka tanpa key setelah database siap.

### 3. Siapkan database dan dataset

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m backend.seed
```

Seeder membaca 17 file pada `data/dataset_kasirnusa`. Runtime memakai versi aktif di MySQL, tanpa SQLite. Impor bersifat transaksional dan idempoten: versi yang sama tidak digandakan, riwayat tetap tersimpan, dan dataset aktif dikenali tanpa restart.

### 4. Jalankan aplikasi

Terminal pertama — backend:

```powershell
.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Terminal kedua — frontend:

```powershell
bun run dev
```

Buka **[localhost:5173](http://127.0.0.1:5173)**. Vite meneruskan `/api` ke backend. Periksa kesiapan database di **[backend readiness](http://127.0.0.1:8000/api/health/ready)**.

Untuk deployment, tersedia image frontend/backend terpisah, CI/CD, dan konfigurasi Coolify. Ikuti [panduan deployment](DEPLOYMENT.md) untuk konfigurasi server serta migration/seeder manual melalui container.

<details>
<summary><strong>Menjalankan hasil build dan melihat API</strong></summary>

Untuk menyajikan hasil build melalui FastAPI:

```powershell
bun run build
.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Jika backend sudah berjalan, restart setelah build pertama agar `dist` terpasang. Buka [localhost:8000](http://127.0.0.1:8000).

| Endpoint                                      | Fungsi                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/health`                             | Konfigurasi gateway/model dan ketersediaan key; bukan uji koneksi OpenRouter. |
| `GET /api/health/live`                        | Proses backend hidup; tidak mengakses MySQL atau OpenRouter.                  |
| `GET /api/health/ready`                       | MySQL, migration, dan dataset aktif siap: `200`, atau `503` jika belum.       |
| `GET /api/graph?account_id=C02`               | Graph global atau konteks akun.                                               |
| `GET /api/accounts/{id}/context`              | Sumber dan ringkasan konteks akun.                                            |
| `POST /api/accounts/{id}/expansion-runs`      | Mulai analisis; respons `202` dengan run ID.                                  |
| `GET /api/accounts/{id}/expansion-runs`       | Riwayat analisis akun.                                                        |
| `GET /api/expansion-runs/{run_id}`            | Status tahap, hasil, dan error.                                               |
| `DELETE /api/expansion-runs/{run_id}`         | Hapus satu hasil: `204`; tidak ditemukan: `404`; proses aktif: `409`.         |
| `GET /api/expansion-runs/{run_id}/export/md`  | Ekspor ringkasan Markdown.                                                    |
| `GET /api/expansion-runs/{run_id}/export/csv` | Ekspor peluang CSV.                                                           |

Frontend melakukan polling selama analisis aktif. Backend memakai satu worker/satu instance; analisis yang terputus saat restart ditandai gagal. OpenRouter memakai timeout 60 detik per panggilan, maksimal tiga percobaan untuk HTTP `429` dan `5xx`. Kegagalan ditampilkan tanpa hasil simulasi.

</details>

## Contoh analisis

Cari **C02** atau **C06** untuk menelusuri contoh peluang dari dataset.

|                             | C02 · TB Sinar Jaya                                                   | C06 · Saiyo Group                                                                       |
| --------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Bukti percakapan**        | I0253: rencana enam cabang; I0255: respons awal owner.                | I0300: permintaan penawaran/jadwal sepuluh outlet; belum ada balasan langsung tercatat. |
| **Kontrak**                 | K-C02 · Growth · 25 outlet · diskon 5%.                               | K-C06 · Enterprise · 30 outlet · diskon 10%.                                            |
| **Tambahan → target**       | 6 → **31 outlet**.                                                    | 10 → **40 outlet**.                                                                     |
| **Bruto per tahun**         | **Rp25.200.000**                                                      | **Rp42.000.000**                                                                        |
| **Neto skenario per tahun** | **Rp23.940.000**                                                      | **Rp37.800.000**                                                                        |
| **Perlu dikonfirmasi**      | Jadwal, kebutuhan fitur, dan paket untuk target di atas batas Growth. | Respons penawaran, stakeholder, dan jadwal implementasi.                                |

Formula: **tambahan outlet × Rp350.000 × 12 bulan**. Neto memakai skenario diskon kontrak existing tetap berlaku. Angka tersebut digunakan bila tambahan outlet terpilih dengan bukti memadai; bukan harga penawaran final atau hasil Jev yang sudah disiapkan. Belum ada deal/keputusan khusus C02/C06 di sumber. Pipeline pelanggan baru ditampilkan terpisah.

## Dokumentasi

| Panduan                                                    | Isi                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Deployment dan MySQL](DEPLOYMENT.md)                      | Image Docker, Coolify, environment, migration/seeder container, health check, dan CI/CD. |
| [Panduan data](docs/DATA_GUIDE.md)                         | Sumber dataset, relasi, aturan bisnis, dan dasar perhitungan.                            |
| [Jev dan Account Expansion](docs/JEV_ACCOUNT_EXPANSION.md) | Peran Choice, Score, Noul, confidence, serta keterlacakan analisis.                      |

## Pengujian dan batasan

Frontend menggunakan **Oxlint** dan **Oxfmt**. Jalankan pemeriksaan lint, format, dan build dengan:

```powershell
bun run check
```

Tes backend dan antarmuka membutuhkan database khusus tes. Siapkan sesuai [panduan pengujian](DEPLOYMENT.md#pengujian), lalu jalankan:

```powershell
.venv/Scripts/python.exe -m pytest backend/tests -q
bunx playwright install chromium
bun run test:e2e
```

Tes memakai respons Jev terkontrol tanpa panggilan berbayar. Gunakan `TEST_DATABASE_URL` dan `DATABASE_URL` menuju schema berakhiran `_test`, dengan key OpenRouter kosong untuk backend Playwright.

**Cara membaca hasil:** confidence menyatakan kepastian penilaian model, bukan peluang transaksi berhasil. Confidence berbeda dari probabilitas pilihan. Confidence di bawah 60%, pilihan tertinggi seri, atau bukti ambigu dapat memerlukan review; alasan konkretnya ditampilkan terpisah dari catatan bisnis.

- Kualitas Jev pada data bisnis berbahasa Indonesia perlu dievaluasi tersendiri; tes otomatis memverifikasi alur aplikasi.
- Angka outlet ambigu tidak dipakai sebagai nilai pasti. Jadwal, approval, harga upgrade, dan komitmen pelanggan yang belum ada tidak dibuat.
- Tiket terbuka tidak otomatis menghambat ekspansi. Paket Enterprise tanpa batas kapasitas tidak berarti outlet tambahan gratis.
- Penghapusan riwayat bersifat permanen untuk satu hasil beserta log lokal. Proses aktif tidak dapat dihapus; dataset sumber tetap utuh.
