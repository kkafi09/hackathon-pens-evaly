# Jev untuk Dashboard Account Expansion

Dokumen ini menjelaskan penggunaan Jev pada dashboard Account Expansion v2.0 untuk hackathon KasirNusa, tim 5, serta konteks rancangan awal integrasinya.

Tanggal kajian dokumentasi: 9 Oktober 2026. Snapshot dataset bisnis tetap 1 Oktober 2026.

**Status: panduan implementasi saat ini.** Contoh C02/C06 adalah ilustrasi bukti dan perhitungan dari dataset, bukan keluaran API Jev. Dokumen ini tidak mengklaim akurasi model berdasarkan pengujian respons terkontrol.

Implementasi dashboard tersedia pada root repositori; baca [panduan dashboard](../README.md) dan [instruksi implementasi](../AGENTS.md). Integrasi memakai API asli dan riwayat MySQL; respons terkontrol hanya dipakai dalam pengujian. Pengujian aplikasi tidak membuktikan akurasi model asli pada dataset.

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

Pembagian tanggung jawab aplikasi:

- **Pengolahan data:** membaca seluruh dataset, memvalidasi ID, menangani duplikasi dan nilai kosong.
- **Context graph:** menghubungkan akun, kontak, interaksi, kontrak, usage, tiket, fitur, dan keputusan; mengambil jalur bukti yang relevan.
- **Jev:** menilai makna pesan, jenis sinyal, kekuatan niat, hambatan, dan pilihan tindakan dari opsi yang telah ditentukan.
- **Kode aplikasi:** menghitung rupiah, jumlah outlet, batas paket, umur stage, tanggal, dan skor gabungan dengan formula eksplisit.
- **Dashboard:** menyajikan hasil beserta sumber, asumsi, confidence jika tersedia, dan status evaluasi.

State dapat berupa teks atau JSON terstruktur. Gunakan field yang jelas serta ID sumber. Ambil konteks relevan dari dataset penuh sebelum request; jangan mengirim seluruh transaksi harian untuk setiap pertanyaan. Jev menerima teks, sehingga PDF gambar perlu diekstraksi/OCR terlebih dahulu.

Sumber: [State](https://docs.typesafe.ai/concepts/state), [Batasan Jev 1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

## Evaluasi Account Expansion v2.0

Sumber definisi yang dipakai backend dan dashboard adalah `backend/rubric.py`, versi `expansion-v2.0`. Seluruh 19 pertanyaan dan tipe tercantum pada [rubrik evaluasi](../RUBRIK_EVALUASI.md).

| Kelompok | Parameter     | Tujuan                                                            | Bobot skor |
| -------- | ------------- | ----------------------------------------------------------------- | ---------- |
| OI       | OI-1–OI-4 (4) | Sinyal, jenis, kekuatan bukti niat, dan rincian ekspansi          | 30%        |
| EP       | EP-1–EP-5 (5) | Keterlacakan, jenis, kekuatan, relasi, dan dukungan lintas sumber | 30%        |
| FE       | FE-1–FE-3 (3) | Kecukupan input dan verifikasi estimasi nilai                     | 15%        |
| BR       | BR-1–BR-4 (4) | Hambatan, kesiapan, dan kebutuhan konfirmasi                      | 20%        |
| PC       | PC-1–PC-3 (3) | Relasi pipeline dan dasar tindak lanjut                           | 5%         |

Urutan eksekusi: konteks → OI → FE → BR → PC → EP → hasil. Klasifikasi pesan, pemilihan kandidat angka outlet, dan pilihan tindakan merupakan pemeriksaan pendukung workflow, bukan tambahan parameter rubrik. Hasil akhir memakai validasi kode `validation-v1.0` dan agregasi deterministik `expansion-score-v1.0`, tanpa panggilan model tambahan untuk menulis kesimpulan. OI-3 tetap tersedia dalam detail dan menyumbang skor, tetapi label/confidence niat bukan ringkasan keseluruhan.

## Konteks rancangan awal (historis)

Tabel berikut menyimpan rancangan awal sebelum 19 parameter v2.0 diterapkan; ini bukan kontrak pertanyaan saat ini atau keluaran API.

| Tahap             | Contoh pertanyaan spesifik                                                                                                                           | Primitive | Manfaat di dashboard                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------- |
| Klasifikasi pesan | Apa tujuan utama pesan: ekspansi, renewal, keluhan, lainnya, atau tidak jelas?                                                                       | Choice    | Filter dan kategori sinyal               |
| Kekuatan niat     | Apakah bukti menunjukkan belum ada rencana, eksplorasi, rencana konkret, atau permintaan penawaran?                                                  | Score     | Tingkat kematangan peluang               |
| Pemeriksaan tiket | Apakah isi tiket secara eksplisit menunjukkan masalah yang menghambat rollout outlet baru?                                                           | Noul      | Indikator hambatan yang perlu ditelusuri |
| Tindak lanjut     | Berdasarkan bukti, langkah mana yang paling sesuai: discovery, penawaran, penyelesaian hambatan, konfirmasi stakeholder, atau informasi belum cukup? | Choice    | Saran tindakan untuk AM/Sales            |

Sediakan opsi tidak jelas/informasi belum cukup pada Choice yang relevan. Untuk Score, tetapkan tingkatan satu dimensi dan gunakan pemeriksaan kecukupan bukti terpisah agar data kosong tidak dianggap niat rendah.

Pada implementasi v2.0, klasifikasi pesan memberi konteks bagi OI-1 (Noul adanya sinyal), OI-2 (Choice jenis), dan OI-3 (Score kekuatan bukti niat). Noul juga dipakai pada bukti, estimasi, hambatan, dan pipeline. Jangan menggunakan rancangan historis ini untuk menghapus atau menambah pertanyaan rubrik.

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

Referensi lokal: `data/dataset_kasirnusa/interactions.jsonl`, `contracts_billing.csv`, `crm_accounts.csv`, dan `employees.csv` pada folder dataset yang sama. Verifikasi ulang record saat implementasi; jangan menjadikan contoh ini pengganti analisis dataset penuh.

## Peran data usage

"Penggunaan Jev" dan "product usage" adalah dua hal berbeda. Jev menilai konteks, sedangkan product usage menjadi salah satu sumber fakta untuk analisis.

- `product_usage_daily.csv`: agregasikan tren transaksi per akun/outlet, cakupan hari aktif, versi aplikasi, dan indikator offline dengan kode.
- `feature_usage_monthly.csv`: agregasikan adopsi fitur dan perubahan penggunaan per bulan.
- Hubungkan ringkasan usage dengan tiket, bug, rilis, dan roadmap sebelum menilai kesiapan operasional.
- Jangan menganggap transaksi server turun sebagai penurunan aktivitas bisnis tanpa memeriksa sinkronisasi. Jangan menjumlahkan transaksi offline dan server tanpa memastikan definisinya tidak tumpang tindih.
- Usage mendukung penilaian kesiapan/risiko; niat ekspansi terutama ditelusuri dari interaksi dan bukti komersial. Estimasi rupiah berasal dari outlet tambahan dan ketentuan kontrak.

## Tampilan dashboard saat ini

| Bagian           | Isi                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Ringkasan        | Status validasi, jenis sinyal, skor dukungan ekspansi, estimasi, keterbatasan, dan tindakan     |
| Report           | Hasil lintas akun, pencarian akun, filter status, pagination, dan PDF pilihan maksimal 50 hasil |
| Detail akun      | Timeline interaksi, kontrak, stakeholder, usage, tiket, fitur, keputusan                        |
| Graph bukti      | Jalur dari akun ke sumber yang mendukung rekomendasi                                            |
| Panel Jev        | Pertanyaan, hasil, confidence jika tersedia, versi model, tanggal evaluasi                      |
| Pipeline terkait | Deal baru dan hubungan lintas akun yang terbukti; nilai dipisahkan dari ekspansi existing       |

Narasi kesimpulan, alasan review, dan tindak lanjut disusun dengan template kode dari jawaban serta pemeriksaan tersimpan. Tidak ada model generatif tambahan. Jangan menampilkan alasan atau kutipan seolah-olah merupakan penalaran internal Jev.

Navigasi utama terdiri dari **Graph** dan **Report**. Graph menyediakan pencarian semua node; panel akun memuat **Workflow analisis**, **Data & bukti**, serta **Hasil analisis**. Tombol **Lihat penjelasan hasil** membuka detail validasi, langkah berikutnya, dan **Bagaimana skor dihitung** beserta kontribusi 19 parameter serta sumbernya. Ekspor per hasil tersedia sebagai Markdown, CSV, dan PDF; Report juga mendukung PDF beberapa hasil. Membuka panel atau replay tidak memanggil Jev.

Sumber: [Batasan Jev 1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

## Confidence, keterlacakan, dan evaluasi

- Confidence Choice/Score dihitung dari distribusi jawaban. Confidence bukan probabilitas deal menang dan bukan jaminan jawaban benar. Noul tidak memiliki field confidence terpisah.
- Aturan aplikasi: Noul ≤40% tidak mendukung pernyataan parameter, >40% dan <60% ambigu (review), ≥60% mendukung. Choice/Score dengan confidence <60%, probabilitas tertinggi seri, atau kategori unclear memicu review. Batas ini belum dikalibrasi terhadap akurasi atau hasil deal; bukan aturan universal.
- Simpan ID sumber, versi pertanyaan/rubrik, model aktual yang digunakan, waktu evaluasi, dan respons API. Ini memungkinkan penelusuran dan perbandingan hasil.
- Uji pesan berbahasa Indonesia dari dataset. Dokumentasi menyatakan bahasa pelatihan utama Jev adalah Inggris dan akurasi bahasa lain lebih rendah; ukur pada contoh kasus ini sebelum mengandalkan hasilnya.
- Bedakan status belum dievaluasi, berhasil, tidak cukup bukti, dan API gagal. Jangan mengganti kegagalan API dengan hasil contoh yang tampak nyata.
- Tampilkan fakta sumber, hasil perhitungan, dan penilaian model sebagai elemen yang berbeda.

Sumber: [Confidence](https://docs.typesafe.ai/confidence), [State](https://docs.typesafe.ai/concepts/state).

## Integrasi yang digunakan

Dashboard memakai endpoint `POST https://openrouter.ai/api/v1/systemone`, autentikasi Bearer dengan `OPENROUTER_API_KEY`, dan `OPENROUTER_MODEL` default `~typesafe/jev-latest`. Format state/questions/answers tetap mengikuti System One. Model aktual dari respons dicatat agar hasil dapat ditelusuri. Dokumentasi TypeSafe menjadi referensi konsep dan rubrik; konfigurasi dashboard mengikuti OpenRouter.

API dipanggil melalui backend FastAPI; frontend menggunakan React, TypeScript, Vite, dan React Flow. API key disimpan pada environment backend. Respons, model aktual, provenance, dan hasil disimpan di MySQL; kegagalan ditampilkan tanpa simulasi. Lihat [README](../README.md) dan [deployment](../DEPLOYMENT.md) untuk setup, timeout, dan pengujian.

Sumber: [Quick start](https://docs.typesafe.ai/introduction/quickstart).

Nilai yang ingin ditunjukkan kepada juri: context graph menghubungkan bukti, Jev mengubah teks menjadi penilaian terstruktur, kode menghitung dampak bisnis, dan dashboard memperlihatkan jalur dari sumber ke rekomendasi.

## Kesimpulan, skor, dan replay

**Selesai** berarti evaluasi berakhir tanpa pemicu review, bukan seluruh jawaban positif atau transaksi pasti berhasil. **Perlu ditinjau** mempertahankan judul **Hasil perlu ditinjau** dan **Usulan setelah verifikasi**, meskipun skor tinggi. Satu sumber langsung boleh selesai dengan catatan; EP-5 negatif tidak otomatis membatalkan sinyal. Klaim lintas sumber yang bertentangan dengan provenance memicu review. Record dievaluasi, record pendukung, dan jumlah sumber berbeda dipisahkan; beberapa record dari berkas sama tetap satu sumber.

Skor dukungan ekspansi memakai semua parameter yang berlaku dengan bobot OI/EP/FE/BR/PC sebesar 30/30/15/20/5, dibatasi OI-1, EP-1, dan EP-4. BR-1/BR-4 dibalik sesuai makna risiko. Pipeline netral hanya bila pemeriksaan jawaban dan kandidat jalurnya memenuhi syarat; bobot PC 5 dikeluarkan sehingga pembagi menjadi `30 + 30 + 15 + 20 = 95`. Lihat [rumus lengkap](EXPANSION_SCORE.md) untuk pemetaan, pembatas satu sumber, dan kelengkapan.

`result.validation_summary` dan `result.expansion_score` dipakai bersama oleh panel, Report, serta ekspor. Replay v2 menurunkan keduanya dari jawaban dan snapshot tersimpan tanpa panggilan model atau penulisan ulang history. Riwayat yang tidak lengkap menampilkan keterbatasan dan tidak memperoleh skor pengganti. Riwayat versi lama tetap ditampilkan dengan keterbatasannya.

## Dashboard: OpenRouter dan highlight sumber

Dashboard memakai Jev melalui OpenRouter System One dengan `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` default `~typesafe/jev-latest`. Workflow Choice/Score/Noul tetap dipertahankan. Backend menyimpan model aktual, gateway, metadata respons dan snapshot provenance. Graph/panel membedakan input yang dievaluasi, bukti ekspansi (ungu), dasar perhitungan (biru), serta konteks/konfirmasi (kuning). Peran sumber berasal dari workflow, bukan alasan internal model. Hasil TypeSafe lama tetap tersedia dengan label gateway asal dan keterbatasan provenance. Lihat panduan dashboard untuk konfigurasi dan demo.
