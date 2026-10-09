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

Expected HTTP status 200. Dockerfile juga memiliki HEALTHCHECK. Healthy berarti proses hidup; setup baru selesai ketika readiness berhasil setelah migration/seeder manual. MySQL health query memakai timeout 3 detik. OpenRouter tidak dipanggil oleh health check.

## CI/CD dan rollback

Pull request menjalankan lint, format, build, migration/seed MySQL sementara, pytest, dan Playwright dengan respons Jev terkontrol. Push main menerbitkan kedua image dengan tag `sha-<commit>` dan `latest`, lalu memperbarui tag Coolify dan memanggil authenticated deploy webhook.

Repository secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `COOLIFY_API_TOKEN`. Repository variables: `COOLIFY_URL`, `COOLIFY_BACKEND_UUID`, `COOLIFY_FRONTEND_UUID`. Tidak ada credential produksi di image atau source control.

Backend satu worker/satu instance. Deployment menunggu analisis aktif selesai, menghentikan backend lama, lalu deploy backend baru dan frontend setelah liveness berhasil. Pipeline melaporkan readiness secara terpisah; tidak menjalankan migration/seeder produksi. Jalankan migration manual setiap ada revision baru, sebelum menggunakan fitur yang bergantung padanya. Rollback memilih tag SHA terakhir pada Coolify tanpa downgrade database otomatis.

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
