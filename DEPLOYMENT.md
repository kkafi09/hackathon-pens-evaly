# Evaly: deployment dan MySQL

## Container dan setup manual

Project Coolify **Evaly**, environment **production**, berisi dua aplikasi Docker Image, tanpa Docker Compose:

| Aplikasi | Image                  | Domain                    | Port |
| -------- | ---------------------- | ------------------------- | ---- |
| Frontend | kkafi09/evaly-frontend | https://evaly.kafi.gg     | 8080 |
| Backend  | kkafi09/evaly-backend  | https://api-evaly.kafi.gg | 8000 |

Gunakan instance MySQL existing dengan schema `evaly` dan pengguna khusus. Atur `DATABASE_URL=mysql+pymysql://USER:PASSWORD@HOST:3306/evaly?charset=utf8mb4`, `OPENROUTER_API_KEY`, dan `OPENROUTER_MODEL` hanya pada backend Coolify. URL-encode karakter khusus password. Frontend memakai `BACKEND_URL=http://evaly-backend:8000`; browser mengakses `/api` pada origin frontend.

Backend image memiliki working directory `/app`, dependency, Alembic, migration, serta salinan 17 file sumber pada `/app/data/dataset_kasirnusa`. Database tidak dimigrasikan atau diisi otomatis. Dari terminal server:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
docker exec -it NAMA_CONTAINER_BACKEND python -m alembic upgrade head
docker exec -it NAMA_CONTAINER_BACKEND python -m backend.seed
```

Atau masuk dengan `docker exec -it NAMA_CONTAINER_BACKEND sh`, lalu jalankan kedua perintah Python. Environment diwarisi dari Coolify; jangan menulis credential pada argumen shell. Opsi `python -m backend.seed --source /lokasi/dataset` tersedia.

Seeder memvalidasi dataset, menjaga hash/urutan/nilai asli, mengunci impor bersamaan, dan mengaktifkan versi baru hanya setelah transaksi sukses. Pengulangan hash yang sama tidak menggandakan record. Seeder tidak memanggil Jev atau menghapus hasil analisis. Riwayat SQLite lokal tidak diimpor.

## Health check

Container tetap berjalan sebelum database siap supaya dapat menerima exec. `/api/health/live` menguji proses tanpa database/OpenRouter. `/api/health/ready` menguji koneksi MySQL, revision Alembic, dan dataset aktif: 200 ketika siap, 503 ketika belum. Readiness juga melaporkan jumlah run aktif. Endpoint data mengembalikan 503 sebelum siap; setelah seeding, runtime mengenali dataset aktif tanpa restart.

| Aplikasi | Endpoint Coolify          | Interval | Timeout | Retry | Start period |
| -------- | ------------------------- | -------- | ------- | ----- | ------------ |
| Backend  | GET /api/health/live:8000 | 30 detik | 5 detik | 3     | 30 detik     |
| Frontend | GET /healthz:8080         | 30 detik | 5 detik | 3     | 15 detik     |

Expected HTTP status 200. Dockerfile juga memiliki HEALTHCHECK. Image backend menyertakan curl untuk HTTP health check yang dibuat platform; image frontend menyediakan wget. Healthy berarti proses hidup; setup baru selesai ketika readiness berhasil setelah migration/seeder manual. MySQL health query memakai timeout 3 detik. OpenRouter tidak dipanggil oleh health check.

## CI/CD dan rollback

Pull request hanya memasang dependency frontend dan menjalankan `bun run lint`. Push main atau pemicu manual menjalankan lint, lalu build/push image frontend dan backend secara paralel dengan tag `sha-<commit>` dan `latest` serta cache build. Build frontend tetap memeriksa TypeScript. Build dan deployment mengikuti perubahan file: `src/`, `public/`, dependency/config frontend, dan Nginx memicu FE; `backend/`, `migrations/`, `data/`, dependency/config backend memicu BE. Perubahan workflow, skrip deployment/deteksi, `.dockerignore`, atau `.gitattributes` memicu keduanya. Katalog bersama `locales/` disertakan dalam kedua image; perubahan katalog memicu build frontend dan backend. Dokumentasi saja melewati lint/build/deploy. Pemicu manual memproses kedua aplikasi. Deployment hanya berjalan setelah semua image yang dipilih berhasil dipush. Workflow tidak menjalankan format check, database tes, pytest, Playwright, atau smoke test container. Pengujian tetap dapat dijalankan manual.

Repository secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `COOLIFY_API_TOKEN`. Repository variables: `COOLIFY_URL`, `COOLIFY_BACKEND_UUID`, `COOLIFY_FRONTEND_UUID`. Tidak ada credential produksi di image atau source control.

Backend satu worker/satu instance. Skrip tetap menunggu analisis aktif selesai dan menghentikan backend lama sebelum penggantian. Mode `python deploy/coolify.py --trigger-only` memperbarui tag aplikasi terpilih (`--components frontend backend`), lalu memicu backend diikuti frontend bila keduanya dipilih tanpa menunggu deployment selesai. Pipeline melaporkan **Deployment triggered** setelah webhook aplikasi terpilih diterima; ini bukan konfirmasi aplikasi sudah berjalan. Health check tetap ditangani platform. Tanpa flag, skrip mempertahankan mode menunggu deployment dan pemeriksaan health. Workflow tetap antre tanpa pembatalan run aktif dan tidak menjalankan migration/seeder produksi. Jalankan migration manual setiap ada revision baru, sebelum menggunakan fitur yang bergantung padanya. Rollback memilih tag SHA terakhir pada Coolify tanpa downgrade database otomatis.

## Pengujian

Gunakan schema khusus berakhiran `_test`, jangan produksi. Atur `TEST_DATABASE_URL` dan `DATABASE_URL` ke schema tes, jalankan migration/seeder, lalu pytest. Pengujian riwayat hanya menghapus record pada schema tes. Backend untuk Playwright harus memakai schema tes dengan OPENROUTER_API_KEY kosong.

```bash
python -m alembic upgrade head
python -m backend.seed
python -m pytest backend/tests -q
bun run check
bun run test:e2e
```

Dataset salinan sengaja disertakan dalam repo/image untuk seeder. `.gitattributes` mempertahankan byte dataset agar hash sumber tidak berubah. File .env, SQLite, runtime, dependency lokal dan credential tidak dipublikasikan.
