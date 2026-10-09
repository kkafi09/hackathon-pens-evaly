# Evaly Context Intelligence

Dashboard context graph untuk Account Expansion. React + TypeScript + React Flow di frontend; FastAPI, HTTP API Jev, dan MySQL di backend. Dataset salinan tersedia untuk seeder; runtime membaca versi aktif dari MySQL. Panduan container, migration, seeder dan CI/CD ada di [DEPLOYMENT.md](DEPLOYMENT.md).

## Menjalankan di Windows

Prasyarat: Bun 1.4.2+, Node.js 22+ untuk toolchain Vite/Playwright, dan Python 3.12+. Bun digunakan sebagai package manager dan script runner frontend. Jalankan dari folder `03 Dashboard`.

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
bun install --frozen-lockfile
Copy-Item .env.example .env
```

Isi `DATABASE_URL` dengan koneksi MySQL khusus aplikasi dan `OPENROUTER_API_KEY` di `.env` untuk analisis langsung. `OPENROUTER_MODEL` default `~typesafe/jev-latest`; model aktual dicatat dari respons. Jangan mengirim atau memasukkan key ke frontend. `.env` dikecualikan dari source control.

Terminal pertama:

```powershell
.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Sebelum memakai aplikasi pertama kali, jalankan `.venv/Scripts/python.exe -m alembic upgrade head`, lalu `.venv/Scripts/python.exe -m backend.seed`. Prasyarat database MySQL 8+. Runtime tidak memakai SQLite.

Terminal kedua:

```powershell
bun run dev
```

Buka **http://127.0.0.1:5173**. Frontend meneruskan request `/api` ke backend. Tidak perlu API key untuk menjelajahi graph, data, dan riwayat yang sudah tersimpan.

Untuk satu server setelah build:

```powershell
bun run build
.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Buka http://127.0.0.1:8000. Restart backend setelah build pertama agar folder `dist` terpasang. Aplikasi disiapkan untuk demo lokal, tanpa login atau deployment publik. Font web memiliki fallback lokal jika internet tidak tersedia.

## Alur demo

### Tampilan dan tema

Brand dashboard adalah Evaly. Header menggunakan `public/evaly-logo.svg`; favicon menggunakan `public/evaly-icon.svg`. Logo lengkap tampil tanpa latar tambahan pada kedua tema. Dark mode menggunakan `public/evaly-logo-dark.svg` dengan tulisan putih; light mode menggunakan tulisan biru asli. Warna ikon tetap sama. Warna utama mengikuti gradasi cyan–biru logo. Tombol matahari/bulan di kanan atas mengganti mode terang dan gelap. Saat pertama dibuka, tema mengikuti pengaturan perangkat; pilihan manual disimpan di browser dan bertahan setelah refresh. Dataset sumber tetap KasirNusa.

Styling menggunakan Tailwind CSS 4 melalui plugin Vite. Utility layout dan responsivitas berada pada JSX serta `@apply` di `src/styles.css`; token warna untuk kedua tema didefinisikan pada `:root` dan `:root.dark`. Hook `src/theme.ts` menyelaraskan tema halaman dan React Flow. Warna peran bukti tetap dibedakan pada kedua mode.

1. Graph awal menampilkan 45 akun dan owner; gunakan pencarian akun, filter tipe, atau zoom/pan. Untuk demo, cari C02 atau C06.
2. Klik node akun: menu mengambang memiliki lima fitur, empat terkunci. Account Expansion aktif hanya untuk pelanggan existing.
3. Pilih Account Expansion. Panel kanan terbuka tanpa request Jev. Tab **Data & bukti** menampilkan fakta kontrak, kontak, usage, interaksi, dan tiket.
4. Pilih **Jalankan analisis baru** untuk evaluasi Jev. Tiap tahap menunjukkan status proses asli. Klik tahap untuk melihat pertanyaan, state, distribusi, respons, dan sumber.
5. Buka **Hasil analisis** untuk nilai, asumsi, tindakan, serta jalur bukti. Klik ID bukti untuk menyorot sumber dalam graph. Ekspor Markdown/CSV tersedia setelah hasil akhir terbentuk.
6. Gunakan **Lihat hasil tersimpan** untuk membuka evaluasi sebelumnya. Label replay dan waktu asli selalu ditampilkan. Replay tidak memanggil API; dataset berbeda diberi peringatan.

### C02: TB Sinar Jaya

- I0253 menyebut 6 cabang baru awal 2027; I0255 adalah respons awal Lina.
- K-C02: Growth, 25 outlet, batas 25, harga Rp350.000/outlet/bulan, diskon 5%.
- Sembilan tiket adalah permintaan fitur prioritas rendah, bukan otomatis penghambat ekspansi.
- Jika Jev memilih angka 6 sebagai tambahan yang jelas, kode menghitung target 31 outlet, bruto Rp25.200.000 dan neto skenario Rp23.940.000 per tahun.
- Perlu konfirmasi tiket: email menyebut sudah dikirim, tetapi record tiket yang tersedia bertanggal setelah email.

### C06: Saiyo Group

- I0300 meminta penawaran/jadwal untuk 10 outlet Jakarta Q2 2027. Tidak ada balasan langsung yang tercatat.
- K-C06: Enterprise, 30 outlet, tanpa batas kapasitas paket, diskon 10%.
- Jika angka tambahan 10 terpilih dengan bukti memadai, kode menghitung target 40 outlet, bruto Rp42.000.000 dan neto skenario Rp37.800.000 per tahun.
- 25 tiket tercatat; 24 selesai, satu masalah perangkat terbuka. Tidak ada label penghambat otomatis.

Angka contoh di atas berasal dari sumber/perhitungan, bukan respons Jev yang disiapkan sebelumnya. Aplikasi tidak memasukkan hasil contoh ke riwayat. Tidak ada deal atau keputusan khusus C02/C06 di sumber saat implementasi.

## Data dan analisis

Sumber seeder hanya `data/dataset_kasirnusa`; runtime membaca versi aktif dari MySQL. Semua CSV dan interaksi dibaca, usage harian diringkas bulanan. Log keputusan Excel dibandingkan dengan CSV; perbedaan dicatat, CSV dipakai tanpa menghitung dua kali. Snapshot selalu 1 Oktober 2026.

Graph akun fokus menampilkan kontak, interaksi, kontrak, tiket, fitur yang dipakai, bug terkait, versi rilis, agregat usage, serta deal/keputusan bila memang ada. Outlet detail berada di konteks backend; seluruh 620 outlet tidak ditumpuk di kanvas awal. Relasi memakai ID, thread, alamat email, dan masa kerja; tidak ada hubungan pribadi antarakun yang ditebak.

Workflow:

1. **Data:** ambil konteks dan ringkasan sumber.
2. **Choice:** kategorikan setiap interaksi sebagai ekspansi, keluhan, renewal, lainnya, atau tidak jelas. Request dibagi delapan pesan per batch.
3. **Score:** nilai niat dari pesan ekspansi pelanggan dan thread terkait. Tidak ada pertanyaan deteksi ekspansi tambahan yang menghitung ulang sinyal sama.
4. **Noul:** nilai syarat ekspansi eksplisit per tiket, enam tiket per batch. Tidak ada threshold yang otomatis mengubah hasil menjadi label blocker.
5. **Kode + Choice:** parser mengambil kandidat angka outlet dari pesan pelanggan; Choice memilih angka tambahan atau tidak yakin. Kode menghitung nilai dengan Decimal; Choice menentukan tindakan dari konteks kontrak, tiket, kontak, dan preseden.

Confidence kurang dari 0,6 atau distribusi tertinggi seri ditandai perlu ditinjau. Ini threshold awal transparan untuk demo, **belum dikalibrasi pada evaluasi bisnis**. Klasifikasi tidak pasti tidak diperlakukan sebagai bukti ekspansi yang pasti. Score niat tidak dijumlahkan dengan klasifikasi untuk membuat prioritas ganda.

## API dan riwayat

| Endpoint                                      | Fungsi                                                   |
| --------------------------------------------- | -------------------------------------------------------- |
| `GET /api/health`                             | Status backend, ketersediaan key (boolean), hash dataset |
| `GET /api/graph?account_id=C02`               | Graph global atau konteks akun                           |
| `GET /api/accounts/{id}/context`              | Sumber, ringkasan usage, stakeholder, preseden           |
| `POST /api/accounts/{id}/expansion-runs`      | Mulai background run; 202 dan run ID                     |
| `GET /api/expansion-runs/{run_id}`            | Status tahap, request/response, hasil/error              |
| `GET /api/accounts/{id}/expansion-runs`       | Riwayat dan penanda beda versi data                      |
| `GET /api/expansion-runs/{run_id}/export/md`  | Ekspor Markdown                                          |
| `GET /api/expansion-runs/{run_id}/export/csv` | Ekspor CSV                                               |

Frontend polling tiap detik saat run aktif. Riwayat disimpan di tabel MySQL `expansion_runs`, dengan state asli, pertanyaan, respons, versi rubrik, model aktual, waktu UTC, snapshot, dan SHA-256 sumber. Waktu UI ditampilkan dalam zona Asia/Bangkok. Run aktif saat backend restart ditandai gagal; tidak berpura-pura selesai.

API Jev memakai timeout 60 detik per panggilan dan maksimal tiga percobaan untuk HTTP 429/529. Key kosong, timeout, respons tidak valid, atau kegagalan API ditampilkan secara eksplisit. Tahap yang sudah selesai tetap dapat diperiksa. `.env` dibaca saat backend mulai; restart setelah mengubah key. Data sumber dimuat saat startup, jadi restart setelah mengubah dataset.

## Verifikasi

Oxlint memeriksa TypeScript/React dan pengujian browser. Oxfmt memformat frontend, konfigurasi, dan dokumentasi dashboard; backend Python dan dataset dikecualikan. Dependency dikunci pada `bun.lock`; gunakan `bun add` atau `bun add --dev` untuk perubahan dependency.

```powershell
bun run lint
bun run lint:fix
bun run format
bun run format:check
```

`bun run check` menjalankan lint, format check, lalu build. Format check hanya memeriksa; `bun run format` menulis perubahan format.

```powershell
.venv/Scripts/python.exe -m pytest backend/tests -q
bun run check
bunx playwright install chromium
bun run test:e2e
```

Backend test memakai database temporer dan respons Jev terkontrol. Browser test memakai route mock untuk error/replay dan tidak memasukkan hasil ke database produksi. Tidak ada panggilan Jev berbayar dalam test otomatis.

Cakupan: seluruh akun/relasi, C02/C06, formula, tanpa bukti, data ambigu, key kosong, respons salah, restart, history, ekspor, lima pilihan, prospek terkunci, evidence highlight, replay, dan layar ponsel. Playwright otomatis menyalakan server pada port 8000/5173 jika belum berjalan.

## Batasan yang perlu terlihat saat demo

- Integrasi API tersedia, tetapi kualitas Jev asli perlu diukur pada contoh berlabel bahasa Indonesia menggunakan key pengguna. Pengujian terkontrol membuktikan alur aplikasi, bukan akurasi model.
- Parser jumlah outlet mengenali angka digit diikuti cabang/outlet/gerai. Angka tertulis dengan kata atau rencana ambigu belum dikonversi; tampilkan nilai belum dihitung, bukan menebak.
- Niat dianggap calon peluang berdasarkan pesan pelanggan, bukan saran internal Sales saja. Penilaian modalitas/negasi tetap bergantung pada rubrik dan Jev.
- Riwayat email domain lama dicocokkan lewat local part yang unik dan rentang masa kerja; alamat yang tidak dapat dipastikan perlu ditinjau.
- Preseden akun lain dikirim sebagai pembanding, bukan approval akun ini. Tidak ada harga premium upgrade atau harga cross-sell yang dibuat.
- Enterprise tanpa batas outlet tidak berarti gratis penambahan outlet. Neto adalah skenario diskon existing tetap, bukan harga penawaran final.
- Data server/offline tidak dijumlahkan karena definisi overlap belum dipastikan. Dashboard menampilkan ringkasan, bukan klaim penurunan bisnis otomatis.
- Gunakan satu backend process; jangan menjalankan beberapa worker yang masing-masing memulihkan run aktif dari MySQL.

Referensi: [TypeSafe API](https://docs.typesafe.ai/api), [Score](https://docs.typesafe.ai/primitives/score), [Confidence](https://docs.typesafe.ai/confidence), [Batasan Jev](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

## Jev melalui OpenRouter dan highlight bukti

Analisis baru memakai `https://openrouter.ai/api/v1/systemone` dengan `OPENROUTER_API_KEY` dan model `OPENROUTER_MODEL=~typesafe/jev-latest`. Status key tersedia hanya memeriksa konfigurasi lokal. Autentikasi, saldo, model, timeout, dan batas permintaan dilaporkan saat analisis dijalankan. Gateway, provider, ID respons, model aktual dan biaya tersedia dalam log panggilan; key tidak dikirim ke frontend.

Klik tahap workflow untuk menyorot data yang dievaluasi tanpa memindahkan kanvas. Klik **Fokus bukti** untuk memusatkan graph. Hasil akhir otomatis menampilkan **Bukti pendukung hasil**; gunakan **Semua data yang dievaluasi** untuk konteks lebih luas. Ungu menandai ekspansi/thread, biru dasar perhitungan, kuning konteks/konfirmasi. Klik record untuk membuka snapshot; outline putih menandai pilihan. Relasi tetap berasal dari graph dataset.

Panel sumber menyimpan record asli, pertanyaan terkait input, hasil Jev dan kutipan parser bila tersedia. Ini keterlacakan workflow, bukan alasan internal model. Tiket yang diperiksa tidak otomatis menjadi penghambat. Replay memakai snapshot evaluasi; node yang tidak ada di graph tetap dapat dibaca dari panel. Hasil lama memakai label gateway TypeSafe dan menampilkan keterbatasan provenance; tidak dipanggil ulang otomatis.

Referensi integrasi: [OpenRouter System One dan TypeSafe SDK](https://openrouter.ai/docs/guides/community/typesafe-sdk).

## Membaca hasil dan menghapus riwayat

Setelah analisis selesai, ringkasan di atas panel menampilkan kesimpulan, confidence niat, estimasi bruto, dan tindakan. Pilih **Lihat penjelasan hasil** untuk membaca alasan review, langkah berikutnya, nilai, dan bukti. **Yang perlu ditinjau** berisi pemicu status sebenarnya (confidence di bawah 60%, pilihan seri, klasifikasi tidak jelas, atau angka tambahan belum pasti). Catatan seperti belum ada deal, batas paket, dan belum ada balasan ditampilkan terpisah sebagai hal yang perlu dikonfirmasi. Confidence bukan probabilitas deal menang; probabilitas pilihan juga bukan confidence.

Contoh C02: niat rencana konkret dapat memiliki confidence 97%, sementara rekomendasi discovery confidence 56% sehingga perlu ditinjau. Owner perlu mengonfirmasi enam outlet tambahan, jadwal, kebutuhan fitur, dan paket untuk target 31 outlet. Penjelasan berasal dari keputusan tersimpan dan template kode; tidak ada panggilan model tambahan.

Hapus satu hasil lewat ikon tempat sampah pada riwayat atau **Hapus hasil ini**. Konfirmasi memuat akun, waktu, dan status. Penghapusan permanen hanya mencakup hasil dan log lokal; dataset tidak berubah. Proses menunggu/berjalan tidak bisa dihapus. Setelah hasil terbuka dihapus, panel kembali siap analisis dan highlight kosong tanpa mengganti akun/posisi graph. Hasil lama diberi penjelasan dari informasi tersimpan; keterbatasan data ditampilkan jika alasan rinci tidak dapat diturunkan.

API tambahan: DELETE /api/expansion-runs/{run_id}, respons 204 berhasil, 404 tidak ditemukan, 409 proses aktif. Respons run/hasil dan ekspor menyertakan review_reasons serta next_steps.
