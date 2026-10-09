# Rubrik Evaluasi Account Expansion

| ID   | Pertanyaan validasi                                                                                                | Tipe   |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| OI-1 | Apakah data menunjukkan sinyal ekspansi dari pelanggan yang sudah ada?                                             | Noul   |
| OI-2 | Apa jenis sinyal ekspansi yang teridentifikasi?                                                                    | Choice |
| OI-3 | Seberapa kuat bukti niat ekspansi dalam informasi yang tersedia?                                                   | Score  |
| OI-4 | Apakah sinyal ekspansi didukung oleh informasi spesifik seperti jumlah outlet, lokasi, atau target waktu?          | Noul   |
| EP-1 | Apakah setiap rekomendasi memiliki bukti sumber yang dapat ditelusuri?                                             | Noul   |
| EP-2 | Sumber data apa yang paling relevan untuk memvalidasi peluang ini?                                                 | Choice |
| EP-3 | Seberapa kuat bukti yang tersedia dalam mendukung rekomendasi?                                                     | Score  |
| EP-4 | Apakah hubungan antar-entitas yang digunakan dalam rekomendasi didukung oleh relasi atau record sumber yang valid? | Noul   |
| EP-5 | Apakah rekomendasi didukung oleh bukti relevan dari lebih dari satu sumber yang saling berkaitan?                  | Noul   |
| FE-1 | Apakah data yang tersedia cukup untuk menghitung estimasi nilai ekspansi?                                          | Noul   |
| FE-2 | Faktor utama apa yang paling memengaruhi estimasi nilai ekspansi?                                                  | Choice |
| FE-3 | Apakah estimasi nilai didukung oleh data outlet, harga, dan periode yang dapat diverifikasi?                       | Noul   |
| BR-1 | Apakah terdapat masalah yang berpotensi menghambat realisasi ekspansi?                                             | Noul   |
| BR-2 | Apa jenis hambatan utama yang teridentifikasi?                                                                     | Choice |
| BR-3 | Seberapa siap peluang ini untuk ditindaklanjuti berdasarkan bukti yang tersedia?                                   | Score  |
| BR-4 | Apakah informasi penting masih perlu dikonfirmasi sebelum tindak lanjut dilakukan?                                 | Noul   |
| PC-1 | Apakah terdapat relasi yang relevan antara akun pelanggan dan data sales pipeline?                                 | Noul   |
| PC-2 | Apa jenis relasi bisnis yang ditemukan antara akun dan peluang pipeline?                                           | Choice |
| PC-3 | Apakah relasi tersebut memberikan dasar yang cukup untuk merekomendasikan tindak lanjut bisnis?                    | Noul   |

## Aturan kesimpulan validation-v1.0

Pertanyaan tetap memakai `expansion-v2.0` (19 parameter). OI-3 beserta confidence hanya tampil di detail parameter, bukan sebagai kepastian kesimpulan keseluruhan. Tidak ada persentase kelulusan atau probabilitas deal menang.

Kesimpulan menampilkan **Skor dukungan ekspansi** berdasarkan agregasi seluruh parameter yang berlaku. Rumus, bobot, pemetaan 19 parameter, pipeline netral, dan pembatas dijelaskan pada [panduan skor](docs/EXPANSION_SCORE.md), versi `expansion-score-v1.0`. Angka ini merupakan skor kebijakan rubrik, bukan confidence satu jawaban.

- **Selesai**: evaluasi selesai tanpa pemicu review. Jawaban negatif dapat valid; status ini bukan jaminan kebenaran atau keberhasilan transaksi.
- **Perlu ditinjau**: ada ketidakpastian, input estimasi belum terverifikasi, bukti/relasi tidak valid, kontradiksi provenance, atau riwayat validasi belum lengkap. Ringkasan menggunakan judul **Hasil perlu ditinjau** dan tindakan **Usulan setelah verifikasi**.
- Choice/Score: confidence di bawah 60%, probabilitas tertinggi seri, atau kategori tidak jelas memicu review. Noul >40% dan <60% memicu review; nilai ≤40% berarti tidak mendukung pernyataan parameter, ≥60% berarti mendukung. Tepat 40% dan 60% tidak termasuk rentang ambigu. Batas ini merupakan kebijakan aplikasi, belum merupakan ambang akurasi yang dikalibrasi terhadap hasil bisnis.
- EP-1/EP-4 yang tidak mendukung, serta kegagalan pemeriksaan ID, kutipan, dan keterhubungan graph memicu review. FE-1/FE-3 yang tidak mendukung memicu review bila peluang memerlukan estimasi. Angka yang sudah dihitung ditandai **Skenario belum terverifikasi** jika validasi keuangannya perlu ditinjau.
- BR-1, BR-4, dan PC-1 dibaca sesuai makna pertanyaannya; tidak semua parameter harus positif. Tidak ada hubungan pipeline bukan otomatis kegagalan peluang ekspansi.
- Bukti satu sumber boleh selesai dengan catatan **Bukti pendukung berasal dari satu sumber; validasi lintas sumber belum terpenuhi.** EP-5 negatif menjadi keterbatasan, bukan otomatis review. EP-5 positif yang bertentangan dengan jumlah sumber pendukung memicu review.
- Jumlah record pendukung, sumber berbeda (nama berkas), dan record dievaluasi dihitung terpisah dari provenance. Beberapa record dari berkas sama tetap satu sumber; semua input model bukan otomatis bukti pendukung.

Kesimpulan dibentuk dengan kode dari hasil tersimpan setelah seluruh tahap selesai. Replay v2.0 menurunkan kesimpulan saat dibaca tanpa panggilan model, penulisan ulang history, atau perubahan data sumber. Panel, report, dan ekspor Markdown/CSV/PDF (termasuk PDF beberapa hasil) memakai `result.validation_summary` yang sama. Field kompatibilitas lama tetap tersedia pada API.
