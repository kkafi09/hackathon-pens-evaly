# Skor dukungan ekspansi

Aturan `expansion-score-v1.0` menambahkan skor kebijakan 0–100% dari rubrik `expansion-v2.0`. Seluruh 19 pertanyaan, tipe, kriteria, dan ID tetap sama. Skor bukan probabilitas deal menang, persentase jawaban benar, atau akurasi model. Bobot awal belum dikalibrasi terhadap hasil deal. Parameter saling berkaitan; tidak dianggap sebagai 19 bukti independen.

## Rumus

- Noul positif: `v = p`.
- Noul risiko (BR-1, BR-4): `v = 1 − p`.
- Score: `v = confidence × Σ[P(k) × k/3]`, untuk level 0–3.
- Choice: `v = confidence × Σ[P(kategori pendukung)]`.

Bobot kelompok: OI 30%, EP 30%, FE 15%, BR 20%, PC 5%. Bobot dibagi rata di antara parameter yang berlaku dalam kelompok.

```text
G = rata-rata kontribusi efektif parameter yang berlaku dalam kelompok
S = Σ(bobot kelompok × G) / Σ(bobot kelompok yang berlaku)
Skor akhir = 100 × min(S, v_OI-1, v_EP-1, v_EP-4)
```

Penjumlahan poin parameter menghasilkan skor dasar. Batas bukti dapat menurunkan skor akhir. Confidence tinggi pada jawaban negatif tidak menaikkan peluang.

| ID   | Kontribusi                                                                             |
| ---- | -------------------------------------------------------------------------------------- |
| OI-1 | Noul positif: adanya sinyal                                                            |
| OI-2 | Choice: outlets, upgrade, feature, other; none/unclear = 0                             |
| OI-3 | Score: kekuatan bukti niat                                                             |
| OI-4 | Noul positif: rincian ekspansi                                                         |
| EP-1 | Noul positif: keterlacakan bukti                                                       |
| EP-2 | Choice: kategori sumber tersedia pada input parameter; insufficient = 0                |
| EP-3 | Score: kekuatan bukti                                                                  |
| EP-4 | Noul positif: validitas relasi                                                         |
| EP-5 | Noul positif: dukungan lintas sumber                                                   |
| FE-1 | Noul positif: kecukupan input estimasi                                                 |
| FE-2 | Choice: outlets, price, period, discount; insufficient = 0                             |
| FE-3 | Noul positif: keterverifikasian estimasi                                               |
| BR-1 | Noul risiko: semakin besar hambatan, semakin rendah kontribusi                         |
| BR-2 | Choice: none; kategori hambatan/unclear = 0                                            |
| BR-3 | Score: kesiapan tindak lanjut                                                          |
| BR-4 | Noul risiko: semakin banyak konfirmasi diperlukan, semakin rendah kontribusi           |
| PC-1 | Noul positif: dukungan relasi pipeline bila berlaku                                    |
| PC-2 | Choice: jenis relasi dengan kandidat jalur record valid; preseden bukan relasi faktual |
| PC-3 | Noul positif: dukungan relasi terhadap tindak lanjut                                   |

EP-2 memetakan `source_ids` ke snapshot input: CRM (akun, kontak, deal, riwayat kerja, karyawan), interaksi, usage (harian/fitur), support/produk (tiket, bug, fitur, rilis), kontrak/billing, keputusan. Tidak ada kategori sumber yang otomatis lebih unggul.

## Pembatas dan kelengkapan

Pipeline netral hanya jika tidak ada kandidat jalur berbasis record, PC-1 ≤0,4, PC-2 memilih none dengan confidence ≥60% dan tidak seri, serta PC-3 tidak berlaku. Ketiganya tetap ditampilkan, tetapi dikeluarkan dari agregasi; bobot kelompok aktif menjadi 95%. Klaim pipeline tanpa jalur tidak netral: kontribusi PC-1/PC-2 menjadi 0 dan aturan review tetap berlaku.

Satu sumber boleh selesai dengan catatan. Kontribusi EP-3 maksimal 2/3, EP-5 menjadi 0. Klaim EP-3 beberapa sumber yang bertentangan dengan snapshot memicu review. Beberapa record dari satu berkas tetap satu sumber.

Untuk ekspansi outlet, input estimasi yang belum lolos pemeriksaan kode membuat kontribusi FE-1/FE-3 menjadi 0, meskipun model menjawab mendukung. Jawaban asli tidak diubah. Rincian memperlihatkan kontribusi mentah dan efektif beserta alasannya.

Jawaban wajib yang belum valid tidak dikeluarkan dari pembagi untuk menaikkan skor. Skor akhir tidak tersedia sampai validasi lengkap. Parameter yang secara sah tidak berlaku dikeluarkan dari rata-rata kelompok; kelompok tanpa parameter berlaku dikeluarkan dari pembagi akhir.

Tidak ada skor akhir untuk proses aktif/gagal, tidak adanya sinyal, validasi belum lengkap, atau pemeriksaan ID/kutipan/graph yang gagal. Skor dasar parsial bukan kesimpulan yang dipublikasikan. Review dengan jawaban lengkap boleh memiliki skor, tetapi skor tidak menghapus judul **Hasil perlu ditinjau** dan tindakan **Usulan setelah verifikasi**.

Tampilan satu angka desimal. Nilai kurang dari 100 dibatasi tampil maksimal 99,9%, agar pembulatan tidak menyiratkan skor sempurna. Angka 100% hanya jika seluruh kontribusi berlaku benar-benar 1 dan pemeriksaan wajib terpenuhi.

## Contoh sintetis

Semua kontribusi 1, kecuali EP-3 = 2/3, EP-5 = 0, dan pipeline netral:

```text
OI = 1; EP = (1 + 1 + 2/3 + 1 + 0)/5 = 0,7333; FE = 1; BR = 1
Skor = 100 × (30×1 + 30×0,7333 + 15×1 + 20×1)/95 = 91,6%
```

Ini contoh formula, bukan hasil model C02/C06.

## API dan riwayat

`result.expansion_score` memuat versi, nilai mentah/display, alasan ketidaktersediaan, skor dasar, batas bukti, parameter pembatas, bobot aktif, jumlah parameter berlaku/dievaluasi, kelompok, dan rincian seluruh parameter. Tiap parameter memuat jawaban/confidence asli, sumber, kontribusi mentah/efektif, bobot efektif, poin sebelum pembatas, dan alasan penyesuaian. Report juga memuat `expansion_score`.

Panel, report, Markdown, CSV, dan PDF memakai objek yang sama. Hasil baru menyimpan perhitungan setelah validasi. Replay v2 menurunkannya dari snapshot tanpa panggilan model, perubahan dataset, atau penulisan ulang history. Riwayat tidak lengkap tidak memperoleh angka pengganti. OI-3 tetap hanya satu kontribusi dari keseluruhan skor.
