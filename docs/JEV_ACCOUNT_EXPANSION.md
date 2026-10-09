# Jev untuk Dashboard Account Expansion

Dokumen ini menyimpan hasil pembelajaran dokumentasi TypeSafe dan rancangan penggunaan Jev untuk hackathon KasirNusa, tim 5: Account Expansion.

Tanggal kajian dokumentasi: 9 Oktober 2026. Snapshot dataset bisnis tetap 1 Oktober 2026.

**Status: rancangan integrasi. Belum ada panggilan API Jev atau hasil evaluasi model yang dijalankan sebagai bagian penyusunan dokumen ini.** Contoh penilaian di bawah merupakan pertanyaan yang diusulkan, bukan hasil model.

Implementasi dashboard kini tersedia pada `03 Dashboard`; baca [panduan dashboard](03%20Dashboard/README.md) dan [instruksi implementasi](03%20Dashboard/AGENTS.md). Integrasi memakai API asli dan riwayat lokal; respons terkontrol hanya dipakai dalam pengujian. Pengujian aplikasi tidak membuktikan akurasi model asli pada dataset.

## Apa itu Jev?

Jev adalah model TypeSafe untuk memberikan keputusan atau penilaian terstruktur berdasarkan konteks yang diberikan aplikasi. Aplikasi mengirim `state` dan pertanyaan bertipe, lalu menggunakan jawaban untuk klasifikasi, penilaian, pengurutan, atau penentuan alur tindak lanjut.

Tiga primitive yang tersedia:

| Primitive | Fungsi                                                   | Keluaran utama                                          |
| --------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Noul      | Menilai pertanyaan ya/tidak                              | `noul`, nilai 0-1 yang mewakili probabilitas jawaban ya |
| Choice    | Memilih dari opsi yang ditentukan                        | `choice`, `probabilities`, `confidence`                 |
| Score     | Menilai berdasarkan tingkatan deskriptif yang ditentukan | `score`, `probabilities`, `confidence`                  |

Satu request dapat memuat beberapa pertanyaan yang dievaluasi secara independen terhadap state yang sama. Pecah penilaian kompleks menjadi pertanyaan spesifik; gabungkan hasilnya dengan aturan aplikasi.

Sumber: [Introduction](https://docs.typesafe.ai/introduction), [Primitives](https://docs.typesafe.ai/primitives).

## Posisi Jev dalam sistem

```text
CSV / JSONL / dokumen
        |
        v
Normalisasi dan validasi data
        |
        v
Context graph + pengambilan bukti relevan
        |
        v
State per akun / interaksi / tiket -> Jev -> penilaian terstruktur
        |                                      |
        +--------------------------------------+
        |
        v
Kode: hitung nilai, terapkan aturan bisnis, susun prioritas
        |
        v
Dashboard: peluang, nilai, hasil penilaian, bukti, tindakan
```

Pembagian tanggung jawab yang diusulkan:

- **Pengolahan data:** membaca seluruh dataset, memvalidasi ID, menangani duplikasi dan nilai kosong.
- **Context graph:** menghubungkan akun, kontak, interaksi, kontrak, usage, tiket, fitur, dan keputusan; mengambil jalur bukti yang relevan.
- **Jev:** menilai makna pesan, jenis sinyal, kekuatan niat, hambatan, dan pilihan tindakan dari opsi yang telah ditentukan.
- **Kode aplikasi:** menghitung rupiah, jumlah outlet, batas paket, umur stage, tanggal, dan skor gabungan dengan formula eksplisit.
- **Dashboard:** menyajikan hasil beserta sumber, asumsi, confidence jika tersedia, dan status evaluasi.

State dapat berupa teks atau JSON terstruktur. Gunakan field yang jelas serta ID sumber. Ambil konteks relevan dari dataset penuh sebelum request; jangan mengirim seluruh transaksi harian untuk setiap pertanyaan. Jev menerima teks, sehingga PDF gambar perlu diekstraksi/OCR terlebih dahulu.

Sumber: [State](https://docs.typesafe.ai/concepts/state), [Batasan Jev 1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

## Penggunaan Jev untuk kasus ini

Tabel berikut adalah rancangan pertanyaan, bukan keluaran API.

| Tahap             | Contoh pertanyaan spesifik                                                                                                                           | Primitive | Manfaat di dashboard                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------- |
| Klasifikasi pesan | Apa tujuan utama pesan: ekspansi, renewal, keluhan, lainnya, atau tidak jelas?                                                                       | Choice    | Filter dan kategori sinyal               |
| Kekuatan niat     | Apakah bukti menunjukkan belum ada rencana, eksplorasi, rencana konkret, atau permintaan penawaran?                                                  | Score     | Tingkat kematangan peluang               |
| Pemeriksaan tiket | Apakah isi tiket secara eksplisit menunjukkan masalah yang menghambat rollout outlet baru?                                                           | Noul      | Indikator hambatan yang perlu ditelusuri |
| Tindak lanjut     | Berdasarkan bukti, langkah mana yang paling sesuai: discovery, penawaran, penyelesaian hambatan, konfirmasi stakeholder, atau informasi belum cukup? | Choice    | Saran tindakan untuk AM/Sales            |

Sediakan opsi tidak jelas/informasi belum cukup pada Choice yang relevan. Untuk Score, tetapkan tingkatan satu dimensi dan gunakan pemeriksaan kecukupan bukti terpisah agar data kosong tidak dianggap niat rendah.

Deteksi ekspansi dilakukan melalui klasifikasi Choice, kemudian tingkat niat Score. Tidak ada pertanyaan Noul pendeteksi niat tambahan agar sinyal yang sama tidak dihitung ulang. Noul tetap digunakan untuk pemeriksaan syarat dalam tiket.

Jangan meminta satu pertanyaan besar seperti "analisis seluruh akun dan tentukan strategi terbaik". Nilai niat, hambatan, dan kesiapan secara terpisah. Jika memakai skor prioritas gabungan, tetapkan bobot di kode, jelaskan alasannya, dan uji terhadap contoh berlabel.

Sumber: [Introduction](https://docs.typesafe.ai/introduction), [Composite scoring](https://docs.typesafe.ai/patterns/composite-scoring).

## Contoh alur C02 dan C06

### C02: TB Sinar Jaya

1. Ambil I0253 dan thread terkait: rencana 6 cabang Sidoarjo pada awal 2027 dan pertanyaan kecukupan paket.
2. Hubungkan dengan K-C02: Growth, 25 outlet, batas 25 outlet, harga Rp350.000/outlet/bulan, diskon 5%.
3. Ambil tiket, fitur, riwayat kontak, dan keputusan yang relevan.
4. Gunakan Jev untuk menilai sinyal ekspansi, kekuatan niat, dan makna kebutuhan/keluhan.
5. Gunakan kode untuk menghitung kebutuhan 31 outlet, pelampauan batas Growth, serta nilai tambahan.
6. Tampilkan bukti dan usulan pembahasan paket/penawaran oleh Lina Marlina, E05. Validasi stakeholder dan kebutuhan fitur sebelum finalisasi.

Tambahan tahunan bruto: `6 x Rp350.000 x 12 = Rp25.200.000`.
Skenario neto jika diskon 5% tetap berlaku: `Rp25.200.000 x 95% = Rp23.940.000`.

### C06: Saiyo Group

1. Ambil I0300: rencana 10 outlet Jakarta pada Q2 2027, permintaan penawaran, dan jadwal implementasi.
2. Hubungkan dengan K-C06: Enterprise, 30 outlet, tanpa batas kapasitas paket, harga Rp350.000/outlet/bulan, diskon 10%.
3. Ambil kontak aktif, tiket, adopsi fitur, dan preseden yang relevan.
4. Gunakan Jev untuk menilai apakah terdapat niat ekspansi dan permintaan komersial eksplisit.
5. Gunakan kode untuk menghitung target 40 outlet dan nilai tambahan 10 outlet.
6. Tampilkan bukti dan usulan tindak lanjut penawaran oleh Wahyu Nugroho, E04, dengan jadwal rollout yang perlu dikonfirmasi.

Tambahan tahunan bruto: `10 x Rp350.000 x 12 = Rp42.000.000`.
Skenario neto jika diskon 10% tetap berlaku: `Rp42.000.000 x 90% = Rp37.800.000`.

Total potensi tambahan annualized bruto Rp67.200.000; skenario neto Rp61.740.000. Angka ini bukan booking pasti dan bukan otomatis pendapatan 2027. Kelanjutan diskon serta tanggal go-live perlu dikonfirmasi. Biaya premium upgrade tidak dihitung karena harga tersebut belum tersedia.

Referensi lokal: `01 Case/dataset_kasirnusa/interactions.jsonl`, `contracts_billing.csv`, `crm_accounts.csv`, dan `employees.csv` pada folder dataset yang sama. Verifikasi ulang record saat implementasi; jangan menjadikan contoh ini pengganti analisis dataset penuh.

## Peran data usage

"Penggunaan Jev" dan "product usage" adalah dua hal berbeda. Jev menilai konteks, sedangkan product usage menjadi salah satu sumber fakta untuk analisis.

- `product_usage_daily.csv`: agregasikan tren transaksi per akun/outlet, cakupan hari aktif, versi aplikasi, dan indikator offline dengan kode.
- `feature_usage_monthly.csv`: agregasikan adopsi fitur dan perubahan penggunaan per bulan.
- Hubungkan ringkasan usage dengan tiket, bug, rilis, dan roadmap sebelum menilai kesiapan operasional.
- Jangan menganggap transaksi server turun sebagai penurunan aktivitas bisnis tanpa memeriksa sinkronisasi. Jangan menjumlahkan transaksi offline dan server tanpa memastikan definisinya tidak tumpang tindih.
- Usage mendukung penilaian kesiapan/risiko; niat ekspansi terutama ditelusuri dari interaksi dan bukti komersial. Estimasi rupiah berasal dari outlet tambahan dan ketentuan kontrak.

## Rancangan dashboard hackathon

| Bagian           | Isi                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Ringkasan        | Jumlah peluang existing, tambahan outlet, potensi bruto/neto, asumsi                      |
| Daftar peluang   | Akun, kategori, kekuatan niat, nilai, hambatan, owner, tindakan berikutnya                |
| Detail akun      | Timeline interaksi, kontrak, stakeholder, usage, tiket, fitur, keputusan                  |
| Graph bukti      | Jalur dari akun ke sumber yang mendukung rekomendasi                                      |
| Panel Jev        | Pertanyaan, hasil, confidence jika tersedia, versi model, tanggal evaluasi                |
| Pipeline terkait | Deal baru dan hubungan lintas akun yang terbukti; nilai dipisahkan dari ekspansi existing |

Gunakan template berbasis bukti untuk narasi dashboard, atau model generatif terpisah jika diperlukan. Jev berfokus pada keputusan terstruktur, sehingga narasi panjang dan jawaban bebas perlu komponen lain. Jangan menampilkan alasan atau kutipan seolah-olah dikembalikan Jev jika API hanya mengembalikan nilai terstruktur.

Sumber: [Batasan Jev 1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

## Confidence, keterlacakan, dan evaluasi

- Confidence Choice/Score dihitung dari distribusi jawaban. Confidence bukan probabilitas deal menang dan bukan jaminan jawaban benar. Noul tidak memiliki field confidence terpisah.
- Tentukan threshold setelah menguji contoh berlabel; hasil ambigu dapat ditandai perlu ditinjau. Jangan menganggap threshold contoh sebagai aturan universal.
- Simpan ID sumber, versi pertanyaan/rubrik, model aktual yang digunakan, waktu evaluasi, dan respons API. Ini memungkinkan penelusuran dan perbandingan hasil.
- Uji pesan berbahasa Indonesia dari dataset. Dokumentasi menyatakan bahasa pelatihan utama Jev adalah Inggris dan akurasi bahasa lain lebih rendah; ukur pada contoh kasus ini sebelum mengandalkan hasilnya.
- Bedakan status belum dievaluasi, berhasil, tidak cukup bukti, dan API gagal. Jangan mengganti kegagalan API dengan hasil contoh yang tampak nyata.
- Tampilkan fakta sumber, hasil perhitungan, dan penilaian model sebagai elemen yang berbeda.

Sumber: [Confidence](https://docs.typesafe.ai/confidence), [State](https://docs.typesafe.ai/concepts/state).

## Catatan implementasi mendatang

Dashboard memakai endpoint `POST https://openrouter.ai/api/v1/systemone`, autentikasi Bearer dengan `OPENROUTER_API_KEY`, dan `OPENROUTER_MODEL` default `~typesafe/jev-latest`. Format state/questions/answers tetap mengikuti System One. Model aktual dari respons dicatat agar hasil dapat ditelusuri. Dokumentasi TypeSafe menjadi referensi konsep dan rubrik; konfigurasi dashboard mengikuti OpenRouter.

Panggil API melalui backend. Simpan API key di konfigurasi lingkungan server, jangan di frontend, dataset, atau dokumentasi. Persiapkan penanganan timeout/error dan cache hasil untuk demo. Detail framework/dashboard belum diputuskan oleh dokumen ini.

Sumber: [Quick start](https://docs.typesafe.ai/introduction/quickstart).

Nilai yang ingin ditunjukkan kepada juri: context graph menghubungkan bukti, Jev mengubah teks menjadi penilaian terstruktur, kode menghitung dampak bisnis, dan dashboard memperlihatkan jalur dari sumber ke rekomendasi.

## Dashboard: OpenRouter dan highlight sumber

Dashboard memakai Jev melalui OpenRouter System One dengan `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` default `~typesafe/jev-latest`. Workflow Choice/Score/Noul tetap dipertahankan. Backend menyimpan model aktual, gateway, metadata respons dan snapshot provenance. Graph/panel membedakan input yang dievaluasi, bukti ekspansi (ungu), dasar perhitungan (biru), serta konteks/konfirmasi (kuning). Peran sumber berasal dari workflow, bukan alasan internal model. Hasil TypeSafe lama tetap tersedia dengan label gateway asal dan keterbatasan provenance. Lihat panduan dashboard untuk konfigurasi dan demo.
