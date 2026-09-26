# DebateAI — Kebijakan Privasi

<!-- legal-chrome
summaryTitle: Ringkasnya
eyebrow: KEBIJAKAN PRIVASI · v3.0 · BERLAKU [DATE]
title: Apa yang kami simpan, dan alasannya
lede: Hak Anda dan kewajiban kami berdasarkan GDPR (EU) 2016/679, dalam bahasa yang mudah dipahami. Empat belas bagian dan Lampiran B — gulir hingga akhir.
endMarker: AKHIR KEBIJAKAN · GDPR (EU) 2016/679 · v3.0
bodyLabel: Teks Kebijakan Privasi
annexTitle: Lampiran B — Ketentuan privasi regional
jumps:
01 PENGENDALI
02 YANG KAMI KUMPULKAN
04 DASAR HUKUM
05 MODEL & TRANSFER
06 PUBLIKASI
07 RETENSI
10 HAK GDPR ANDA
13 KUKI
-->

2026-09-21 · @Someone

**Draf v3.0 untuk ditinjau penasihat hukum — menggantikan v2.1 yang telah dirilis (`apps/ui/lib/privacyPolicy.ts`). Bukan nasihat hukum.** Versi ini ditulis sesuai dengan apa yang benar-benar dilakukan kode, dan memperbaiki lima pernyataan dalam v2.1 yang bertentangan dengan kode: data sesi, periode retensi, analitik, ekspor, dan apa yang terjadi pada debat yang dipublikasikan ketika dilakukan penghapusan. Tanda kurung siku menandai hal yang hanya dapat Anda isi; \[pending\] menandai fitur yang dijelaskan kebijakan tetapi belum dibuat, yang harus tersedia sebelum kebijakan dipublikasikan.

**Version 3.0 · Effective \[date\] · Versi sebelumnya di dezbatere.ro/privacy/versions · Pengendali: DebateAIRO S.R.L., Bukares**

**In short.** Kami mengumpulkan apa yang diperlukan akun dan apa yang Anda pilih untuk diketik. Pertanyaan Anda dikirim kepada penyedia AI yang tercantum dalam Daftar kami; pertanyaan tersebut tidak digunakan untuk melatih model. Debat bersifat privat kecuali Anda memublikasikannya. Menghapus akun Anda memusnahkan kunci data Anda dan menurunkan debat yang telah Anda publikasikan. Anda dapat menghubungi kami di privacy@dezbatere.ro, dan orang yang disebut dalam debat dapat meminta penghapusan tanpa memiliki akun.

## 1. Siapa yang bertanggung jawab atas data Anda

Pengendali data pribadi Anda adalah **DebateAIRO S.R.L.**, \[address\], Bukares, Rumania, Daftar Perdagangan \[J40/…\], CUI \[…\]. Hubungi **privacy@dezbatere.ro** untuk hal apa pun dalam kebijakan ini; kami menjawab dalam waktu satu bulan. Kami belum menunjuk petugas perlindungan data karena hukum tidak mewajibkannya; alamat ini dipantau oleh \[role\]. Jika kami telah menunjuk perwakilan atau petugas privasi untuk negara tertentu, mereka disebutkan dalam Lampiran B.

## 2. Apa yang kami kumpulkan dan dari mana asalnya

Kami hanya mengumpulkan apa yang diperlukan agar akun berfungsi, apa yang Anda pilih untuk diberikan kepada kami, dan apa yang diwajibkan hukum untuk kami simpan.

| Kategori | Rinciannya | Sumber |
| --- | --- | --- |
| **Akun** | Alamat email dan alamat email pemulihan (disimpan secara terenkripsi, dengan indeks berkunci agar kami dapat menemukan akun tanpa membaca alamat); kata sandi (disimpan sebagai hash, tidak pernah dalam teks biasa); rahasia autentikasi dua faktor Anda (terenkripsi); sepuluh kode pemulihan (disimpan sebagai hash); nama samaran Anda; waktu ketika Anda mengonfirmasi bahwa Anda berusia 18 tahun atau lebih | Anda, saat pendaftaran |
| **Sesi dan keamanan** | Token sesi yang di-hash; hash berkunci atas string agen pengguna peramban Anda, yang digunakan untuk mengetahui ketika suatu sesi berpindah ke peramban lain; stempel waktu pembuatan, penggunaan terakhir, dan kedaluwarsa. Kami **tidak** menyimpan alamat IP, nama perangkat, atau detail peramban Anda bersama sesi, dan daftar sesi yang Anda lihat di Pengaturan hanya menampilkan stempel waktu | Peramban Anda |
| **Jejak audit keamanan** | Log peristiwa terkait keamanan yang hanya dapat ditambahi, bukan diubah atau dihapus — pendaftaran, verifikasi, upaya masuk, pemulihan, publikasi, penghapusan. Alamat IP dan agen pengguna setiap peristiwa hanya disimpan sebagai digest berkunci satu arah (Argon2id), sehingga tidak dapat dibaca kembali tetapi dapat dicocokkan dalam suatu periode. Sinyal risiko masuk dan pemulihan disimpan secara terenkripsi selama 90 hari | Peramban Anda, pada saat setiap peristiwa |
| **Konten debat** | Pertanyaan yang Anda ketik; anotasi pengarahan yang Anda tetapkan; klaim, kritik, referensi bukti, skor, dan putusan yang dihasilkan mesin; catatan verbatim tentang apa yang dikembalikan setiap penyedia AI; kueri pengambilan dan referensi sumber. Semua ini disimpan secara terenkripsi di bawah kunci khusus untuk akun Anda | Anda, dan model AI yang mengerjakan pertanyaan Anda |
| **Dukungan** | Pesan yang Anda pertukarkan dengan asisten dukungan atau seseorang, disimpan secara terenkripsi; bahasa yang digunakan; apakah Anda mengizinkan asisten melihat status (tidak pernah konten) debat Anda; penilaian yang Anda berikan. Jika pesan memicu pengendalian penyalahgunaan, kami menyimpan hash pesan dan hash alamat IP asalnya | Anda |
| **Catatan penerimaan dan persetujuan** | Versi dan hash konten Ketentuan yang Anda terima dan kebijakan yang ditampilkan kepada Anda; waktu; layar dan mekanisme yang digunakan; bahasa Anda; alamat IP dan agen pengguna Anda pada saat itu; setiap persetujuan yang Anda berikan atau tarik beserta waktunya | Peramban Anda, saat pendaftaran dan setiap kali Anda mengubah pilihan |
| **Pembayaran** \[pending — once a paid plan exists\] | Paket, harga, periode penagihan, referensi transaksi, bukti lokasi pajak. Detail kartu disimpan oleh penyedia pembayaran kami, tidak pernah oleh kami | Anda, dan penyedia pembayaran |
| **Orang yang bukan pengguna kami** | Data pribadi tentang orang lain yang Anda sertakan dalam pertanyaan atau yang dihasilkan mesin saat menjawabnya. Kami meminta Anda untuk tidak melakukan ini; bagian 11 menjelaskan tindakan kami jika hal itu tetap terjadi | Anda, secara tidak langsung |

Kami **tidak** mengumpulkan analitik atau telemetri tentang cara Anda menggunakan produk, dan kami tidak memasang kuki untuk tujuan tersebut. Jika hal itu berubah, kebijakan ini dan Kebijakan Kuki akan berubah terlebih dahulu, dan Anda akan dimintai persetujuan.

## 3. Informasi sensitif

Mesin debat mendorong pertanyaan tentang politik, agama, kesehatan, seksualitas, dan keyakinan. Hal-hal tersebut merupakan kategori data khusus berdasarkan Pasal 9 GDPR, dan dapat muncul dalam pertanyaan Anda baik kami bermaksud mengumpulkannya maupun tidak.

**Tentang Anda.** Saat mendaftar, dalam kalimat terpisah Anda memberikan persetujuan tegas agar kami memproses informasi sensitif yang Anda pilih untuk disertakan dalam pertanyaan Anda sendiri, untuk tujuan menjalankan debat Anda. Anda dapat menariknya kapan saja dengan tidak menyertakan informasi tersebut, atau dengan menghapus debat. Apa yang Anda publikasikan tentang diri sendiri adalah data yang telah Anda pilih untuk dijadikan publik.

**Tentang orang lain.** Tidak ada ketentuan hukum yang mengizinkan kami memproses data sensitif tentang pihak ketiga yang Anda sebut dalam pertanyaan, dan tidak satu pun penyedia AI kami memiliki dasar tersebut. Itulah sebabnya Ketentuan melarangnya, kami meminimalkan apa yang dikirim, dan kami segera menghapus konten tersebut atas permintaan — bagian 11.

**Informasi kesehatan.** Beberapa negara memperlakukan data terkait kesehatan, termasuk inferensi, berdasarkan undang-undang khusus. Jika Anda tinggal di \[the State of Washington\], \[Consumer Health Data Privacy Notice\] yang terpisah berlaku.

## 4. Mengapa kami menggunakan data Anda, dan atas dasar apa

Setiap tujuan memiliki satu dasar hukum berdasarkan Pasal 6(1) GDPR, dan kami tidak menggunakan kembali data yang dikumpulkan untuk satu tujuan bagi tujuan lain.

| Tujuan | Data | Dasar |
| --- | --- | --- |
| Membuat dan menjalankan akun Anda, mengautentikasi Anda, menjalankan dan menyimpan debat Anda agar dapat dibuka kembali dan diputar ulang | Akun, sesi, konten debat | **Kontrak** — Art. 6(1)(b) |
| Mengirim pertanyaan Anda dan pernyataan mesin kepada penyedia AI untuk menghasilkan debat | Konten debat | **Kontrak** — Art. 6(1)(b) |
| Menjaga keamanan layanan, mendeteksi penyalahgunaan, memungkinkan Anda mengenali upaya masuk yang bukan dilakukan oleh Anda, menyimpan jejak audit | Sesi, jejak audit keamanan, hash penyalahgunaan dukungan | **Kepentingan yang sah** — Art. 6(1)(f): kepentingan kami dan Anda atas layanan yang aman. Anda dapat mengajukan keberatan; bagian 10 |
| Membuktikan bahwa Anda menerima Ketentuan serta memberikan atau menarik persetujuan | Catatan penerimaan dan persetujuan | **Kewajiban hukum** — Art. 6(1)(c), kewajiban kami untuk menunjukkan persetujuan berdasarkan Art. 7(1) — dan kepentingan yang sah untuk membuktikan kontrak |
| Menjawab permintaan dukungan | Dukungan | **Kontrak** — Art. 6(1)(b) |
| Memproses informasi sensitif tentang diri Anda yang Anda sertakan | Konten debat | **Persetujuan tegas** — Art. 9(2)(a), diberikan secara terpisah saat pendaftaran |
| Memublikasikan debat yang Anda pilih untuk dipublikasikan | Konten debat, nama samaran | **Kontrak** — Art. 6(1)(b), atas instruksi Anda; untuk data sensitif tentang Anda, Art. 9(2)(e) — data yang secara nyata telah Anda jadikan publik |
| Mengirim berita produk kepada Anda | Alamat email | **Persetujuan** — Art. 6(1)(a), kotak yang tidak dicentang sebelumnya; tarik kapan saja melalui email mana pun atau Pengaturan |
| Memenuhi kewajiban pajak, akuntansi, dan hukum \[pending paid plans\] | Pembayaran, catatan penerimaan | **Kewajiban hukum** — Art. 6(1)(c) |
| Menangani permintaan hukum, laporan konten ilegal, dan kewajiban kami sebagai layanan hos | Apa pun yang relevan dengan permintaan | **Kewajiban hukum** — Art. 6(1)(c) — dan kepentingan yang sah |

Kami tidak membuat profil Anda, tidak menggunakan data Anda untuk iklan, dan tidak menjualnya. Kami tidak menggunakan konten Anda untuk melatih model, dan kami tidak mengizinkan penyedia kami melakukannya — bagian 5.

## 5. Penyedia AI dan transfer internasional

**Apa yang dikirim.** Untuk menjalankan debat, kami mengirim teks kepada satu atau lebih penyedia AI eksternal: pertanyaan Anda, anotasi pengarahan yang Anda tetapkan, dan pernyataan yang disusun mesin selama debat berlangsung. Oleh karena itu, penyedia melihat teks yang diturunkan dari dan dibangun seputar apa yang Anda ketik. Penyedia tidak pernah menerima alamat email, pengenal akun atau sesi, alamat IP, atau detail pembayaran Anda.

**Penyedia yang digunakan.** Mereka tercantum dalam **Daftar Penyedia AI** kami di \[dezbatere.ro/providers\], yang merupakan bagian dari kebijakan ini. Untuk setiap penyedia, Daftar mencantumkan badan hukum dan negara pendiriannya; apa yang diterima dan untuk tujuan apa; negara atau wilayah tempat pemrosesan dilakukan; ketentuan retensinya, dan apakah retensi data nihil aktif untuk titik akhir dan fitur yang kami gunakan; apakah penyedia dapat menggunakan masukan untuk pelatihan berdasarkan kontrak kami; mekanisme transfer yang kami andalkan; serta tanggal terakhir kami memverifikasi setiap entri. Penyedia dapat berubah; Daftar memiliki versi dan perubahan dicatat di sana.

**Pelatihan dan retensi adalah dua hal berbeda.** Kontrak kami dengan penyedia mengecualikan penggunaan konten Anda untuk melatih atau meningkatkan model mereka. \[Publish only once verified per route.\] Beberapa penyedia menyimpan perintah dan tanggapan selama periode terbatas untuk keamanan, pencegahan penyalahgunaan, atau kewajiban hukum mereka sendiri; Daftar menyebutkan durasi dan alasannya. Jika retensi data nihil aktif, Daftar menyatakannya dan untuk fitur mana. Kami tidak akan menyatakan bahwa konten tidak disimpan apabila kenyataannya disimpan.

**Transfer ke luar EEA.** Penyedia yang didirikan di Amerika Serikat menerima data berdasarkan salah satu mekanisme dalam Bab V GDPR: Kerangka Privasi Data EU–US jika badan tertentu yang terikat kontrak disertifikasi untuk data ini, atau klausul kontrak standar Komisi Eropa (Modul Dua, pengendali kepada pemroses) yang didukung penilaian risiko transfer dan langkah tambahan. Daftar menyebutkan mekanisme untuk setiap penyedia. Anda dapat memperoleh salinan klausul yang kami andalkan dengan menghubungi privacy@dezbatere.ro. Jika mekanisme yang kami andalkan dinyatakan tidak sah, kami beralih ke mekanisme lain sebelum melanjutkan transfer, dan kami memberi tahu Anda.

**Penerima lain.** Penyedia hos kami \[Hetzner, Germany — region …\]; penyedia pengiriman konten dan transportasi kami \[Cloudflare\]; relai email kami \[…\]; \[our payment provider, once a paid plan exists\]. Masing-masing bertindak berdasarkan instruksi kami yang terdokumentasi melalui perjanjian pemrosesan data dengan perlindungan yang diwajibkan Pasal 28, dan masing-masing tercantum dalam Daftar beserta lokasi dan mekanisme transfernya. Kami tidak mengizinkan pemroses mana pun menggunakan data Anda untuk tujuannya sendiri. Jika penyedia melakukannya, penyedia tersebut merupakan pengendali dengan haknya sendiri, dan kami tidak mengirimkan data Anda kepadanya.

**Otoritas publik.** Kami mengungkapkan data pribadi kepada pengadilan, regulator, atau otoritas penegak hukum jika diwajibkan hukum, dan kami memberi tahu Anda kecuali hukum melarang kami.

## 6. Publikasi dan visibilitas

Debat bersifat privat sampai Anda memublikasikannya. Publikasi adalah tindakan yang disengaja dan dikonfirmasi secara terpisah. Debat yang dipublikasikan menampilkan **nama samaran** Anda, pertanyaan Anda sebagaimana ditulis, pohon argumen, skor, putusan, dan rentang keyakinan, serta memuat label yang terlihat bahwa konten dihasilkan AI. Debat tersebut tidak pernah menampilkan alamat email, catatan sesi, atau riwayat akun Anda. \[Published debates are / are not\] diindeks oleh mesin pencari \[unless you choose\].

Membatalkan publikasi menghapus debat dari DebateAI dan memusnahkan kunci salinan publik kami. Salinan yang telah dibuat oleh pembaca, mesin pencari, atau arsip berada di luar kendali kami, dan kami tidak dapat menariknya kembali.

Ketika Anda menghapus akun, kami menghapus setiap debat yang Anda publikasikan dari akses publik tanpa penundaan yang tidak semestinya dan paling lambat dalam 30 hari, kecuali hukum mewajibkan kami menyimpan item tertentu. \[Option B — a product change; see the Terms, section 9.\]

## 7. Berapa lama kami menyimpan sesuatu

| Data | Durasi | Setelah itu |
| --- | --- | --- |
| Akun | Selama akun ada, ditambah masa tenggang 7 hari setelah Anda meminta penutupan | Kunci dimusnahkan; catatan dihapus |
| Catatan sesi | 14 hari setelah penggunaan terakhir, atau 90 hari setelah pembuatan, mana yang lebih dahulu | Dihapus |
| Tautan verifikasi email | 24 jam | Dihapus |
| Sinyal risiko masuk dan pemulihan | 90 hari, diterapkan oleh basis data | Dibersihkan |
| Jejak audit keamanan | Selama masa layanan | Hanya dapat ditambahi, bukan diubah atau dihapus; IP dan agen pengguna merupakan digest satu arah dan tidak dapat dibaca kembali |
| Konten debat (privat) | Selama akun ada | Kunci dimusnahkan saat penutupan sehingga konten tidak dapat dibaca |
| Konten debat (dipublikasikan) | Selama dipublikasikan dan selama akun ada | Dihapus dari akses publik saat publikasi dibatalkan atau akun ditutup; kunci dimusnahkan |
| Catatan pengembalian penyedia dan referensi pengambilan | Sama dengan debat terkait | Sama |
| Percakapan dan kasus dukungan | \[Until closed plus 12 months\] | Kunci dimusnahkan |
| Catatan penerimaan dan persetujuan | Masa berlaku akun ditambah 6 tahun — periode pembatasan terpanjang yang berlaku bagi kami | Dihapus |
| Catatan pembayaran \[pending\] | 10 tahun, sebagaimana diwajibkan hukum akuntansi Rumania | Dihapus |
| Cadangan \[pending\] | \[… days\] setelah salinan aktif dihapus | Ditimpa |

**Apa yang sebenarnya dilakukan penghapusan.** Debat dan data akun Anda dienkripsi di bawah kunci yang khusus untuk akun Anda dan setiap debat. Menghapus akun Anda memusnahkan kunci tersebut, setelah itu catatan terenkripsi tidak dapat dibaca oleh kami atau siapa pun, dan kami menghapus catatan akun Anda. Kami menyebutnya penghapusan karena demikianlah akibatnya, dan kami memiliki penilaian terdokumentasi yang mendasarinya; jika Anda ingin mengetahui lebih lanjut, silakan bertanya. Tiga hal yang perlu diketahui: jejak audit keamanan hanya dapat ditambahi, bukan diubah atau dihapus; jejak tersebut tetap disimpan, tetapi tidak berisi pengenal Anda yang dapat dibaca; sejumlah kecil debat lama mendahului skema enkripsi kami saat ini, dan jika hal itu berlaku pada akun Anda, kami memberi tahu apa yang dicapai penutupan terhadapnya; dan salinan data yang telah dikirim kepada penyedia AI diatur oleh ketentuan retensi penyedia tersebut dalam Daftar, bukan oleh penghapusan kami.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Keputusan otomatis dan pembuatan profil

Skor, penanda kondisi, dan putusan dalam debat merupakan evaluasi otomatis atas **argumen, bukan orang**. Hal tersebut tidak menimbulkan akibat hukum bagi Anda dan tidak pula secara serupa memengaruhi Anda secara signifikan. Kami tidak membuat keputusan tentang Anda yang semata-mata didasarkan pada pemrosesan otomatis serta memiliki akibat hukum atau akibat signifikan serupa, dan kami tidak membuat profil Anda.

Jika kami suatu saat mengotomatiskan keputusan tentang akun Anda — menangguhkannya, menolak memublikasikan debat — seseorang akan meninjau keputusan tersebut sebelum berlaku atau atas permintaan Anda, Anda dapat menyampaikan pandangan, dan Anda dapat menggugatnya. Ketentuan menjelaskan caranya.

## 9. Keamanan, dan apa yang terjadi jika ada masalah

Kata sandi di-hash dengan Argon2id. Autentikasi dua faktor diwajibkan. Alamat email, debat, percakapan dukungan, dan rahasia autentikasi Anda dienkripsi saat tersimpan di bawah kunci khusus akun Anda, dan kunci untuk debat yang dipublikasikan disimpan terpisah dari kunci debat privat. Akses ke data produksi dicatat. Alamat IP dan detail peramban dalam log keamanan kami hanya disimpan sebagai digest satu arah.

Jika terjadi pelanggaran data pribadi, kami memberi tahu otoritas pengawas Rumania dalam waktu 72 jam jika diwajibkan hukum, dan kami memberi tahu Anda secara langsung tanpa penundaan yang tidak semestinya jika pelanggaran tersebut kemungkinan menimbulkan risiko tinggi terhadap hak dan kebebasan Anda. Lampiran B mencantumkan aturan pemberitahuan yang berlaku di wilayah lain yang kami layani.

## 10. Hak Anda, dan cara menggunakannya

Anda dapat menggunakan hak-hak ini secara gratis dengan menghubungi **privacy@dezbatere.ro**, atau melalui **Pengaturan → Privasi** jika tersedia kendali. Kami menjawab dalam waktu satu bulan; jika permintaan rumit, kami dapat memerlukan hingga dua bulan tambahan dan akan memberi tahu alasannya. Kami dapat meminta Anda mengonfirmasi identitas melalui akun Anda.

| Hak | Artinya di sini |
| --- | --- |
| **Akses** (Art. 15) | Salinan data pribadi yang kami miliki tentang Anda, dan informasi ini. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Perbaikan** (Art. 16) | Perbaiki email atau email pemulihan Anda dari Pengaturan. Nama samaran Anda tidak dapat diubah karena alasan dalam Ketentuan; Anda dapat menutup akun dan membuka akun baru |
| **Penghapusan** (Art. 17) | Hapus debat privat kapan saja dari halaman debat. Tutup akun Anda dari Pengaturan; bagian 7 menjelaskan secara tepat akibatnya. Minta kami menghapus debat terpublikasi yang memuat data Anda, baik Anda penulisnya maupun bukan |
| **Pembatasan** (Art. 18) | Minta kami berhenti memproses data tertentu sementara perselisihan mengenainya diselesaikan |
| **Keberatan** (Art. 21) | Ajukan keberatan terhadap pemrosesan berdasarkan kepentingan yang sah — pemrosesan keamanan dan audit dalam bagian 4 — dan kami berhenti kecuali dapat menunjukkan alasan kuat. Ajukan keberatan terhadap pemasaran kapan saja, dan kami berhenti |
| **Portabilitas** (Art. 20) | Debat dan data akun Anda dalam format yang umum digunakan serta dapat dibaca mesin. \[Pending: same export as Access.\] Konten nonpribadi yang Anda buat, seperti pertanyaan Anda, dikembalikan kepada Anda atas permintaan ketika kontrak berakhir |
| **Menarik persetujuan** (Art. 7(3)) | Tarik persetujuan pemasaran dari email mana pun atau Pengaturan; tarik persetujuan data sensitif dengan tidak menyertakan data tersebut, atau dengan menghapus debat. Penarikan tidak memengaruhi pemrosesan yang telah terjadi |
| **Mengadu** | Kepada otoritas pengawas Rumania, **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukares, <anspdcp@dataprotection.ro>, atau kepada otoritas di negara tempat Anda tinggal. Kami lebih memilih Anda menghubungi kami terlebih dahulu |

Kami tidak pernah mengenakan biaya atas permintaan dan tidak pernah memperlakukan Anda secara kurang baik karena mengajukannya.

## 11. Orang yang disebut dalam debat dan bukan pengguna kami

Jika seseorang mengajukan pertanyaan kepada DebateAI yang menyebut Anda, kami mungkin menyimpan data pribadi tentang Anda meskipun Anda belum pernah menggunakan layanan ini. Ketentuan melarang pengguna melakukan hal ini, dan kami meminimalkan apa yang dikirim kepada penyedia AI, tetapi hal ini dapat terjadi.

Bagian ini adalah pemberitahuan yang wajib kami berikan kepada Anda berdasarkan Pasal 14 GDPR. Datanya adalah apa pun yang diketik pengguna dan yang dihasilkan mesin sebagai jawaban; sumbernya adalah pengguna tersebut; tujuan dan dasar hukumnya terdapat dalam bagian 4; penerimanya adalah penyedia AI dalam Daftar; retensi mengikuti bagian 7. Anda memiliki setiap hak dalam bagian 10, dan khususnya dapat meminta kami menghapus debat terpublikasi atau privat yang memuat data Anda, serta memberi tahu apa yang kami simpan. Anda tidak memerlukan akun untuk melakukannya. Hubungi **privacy@dezbatere.ro** atau gunakan kendali **Laporkan** pada debat terpublikasi, dan kami menindaklanjuti permintaan yang terbukti tanpa penundaan yang tidak semestinya. Kami tidak dapat memberi tahu Anda secara individual ketika hal ini terjadi karena kami tidak mengetahui siapa Anda atau cara menghubungi Anda; pemberitahuan publik ini dan jalur penghapusan merupakan langkah yang kami ambil sebagai gantinya.

Hal yang sama berlaku untuk informasi sensitif tentang Anda — politik, kesehatan, agama — yang muncul dalam pertanyaan orang lain. Tidak ada ketentuan hukum yang mengizinkan kami terus memprosesnya setelah Anda mengajukan keberatan, dan kami tidak akan melakukannya.

## 12. Anak-anak

DebateAI ditujukan untuk orang dewasa. Anda mengonfirmasi bahwa Anda berusia 18 tahun atau lebih saat mendaftar, dan kami tidak dengan sengaja memproses data siapa pun yang berusia di bawah 18 tahun. Jika kami mengetahui bahwa suatu akun dimiliki oleh orang berusia di bawah 18 tahun, kami menutupnya dan menghapus data sebagaimana dijelaskan bagian 7. Beberapa negara menganggap konfirmasi tidak memadai atau mensyaratkan lebih banyak; Lampiran B menyatakan apa yang berlaku dan di mana, dan Ketentuan menjelaskan tindakan kami mengenainya.

## 13. Kuki

Kami memasang dua kuki, keduanya mutlak diperlukan: satu mempertahankan status masuk Anda, dan satu melindungi formulir dari pemalsuan. Kami tidak memasang kuki analitik, iklan, atau pelacakan. **Kebijakan Kuki** di \[dezbatere.ro/cookies\] mencantumkannya beserta durasinya, menjelaskan cara pilihan Anda disimpan, dan akan berubah sebelum kuki lain ditambahkan. Jika hukum di wilayah Anda memperlakukan beberapa kuki secara berbeda — misalnya aturan opt-out Britania Raya untuk analitik — Kebijakan Kuki menjelaskannya.

## 14. Perubahan atas kebijakan ini

Ketika mengubah kebijakan ini, kami menerbitkan versi baru beserta ringkasan perubahan dan tanggal berlaku baru, serta menyimpan versi sebelumnya di \[dezbatere.ro/privacy/versions\]. Untuk perubahan yang menambahkan tujuan atau penerima baru, kami memberi tahu Anda sebelum pemrosesan baru dimulai, melalui email dan di dalam produk, serta memberi waktu untuk mengajukan keberatan. Jika tujuan baru bergantung pada persetujuan Anda — misalnya jika kami suatu saat ingin menggunakan konten untuk meningkatkan model — kami meminta persetujuan tersebut secara terpisah dan spesifik; kami tidak pernah menganggap penerimaan Ketentuan yang diperbarui sebagai persetujuan atas pemrosesan baru. Untuk klarifikasi yang tidak mengubah apa pun tentang tindakan kami, kami hanya menerbitkan versi baru.

Kebijakan ini terakhir diperbarui pada \[date\]. Versi 3.0 menggantikan versi 2.1, yang menjelaskan data sesi, periode retensi, analitik, ekspor, dan dampak penghapusan terhadap debat terpublikasi dengan cara yang tidak lagi mencerminkan layanan.

## Annex B — Ketentuan privasi regional

Setiap entri hanya berlaku jika wilayahnya tercantum dalam bagian 2 Ketentuan, dan hanya menyatakan hal yang berbeda dari isi utama kebijakan ini.

### B.1 Uni Eropa dan Wilayah Ekonomi Eropa

Isi utama kebijakan ini ditulis untuk Anda. Otoritas pengawas bagi kami adalah **ANSPDCP** Rumania; Anda juga dapat mengadu kepada otoritas di negara tempat Anda tinggal. Pengguna Rumania: kebijakan ini tersedia dalam bahasa Rumania di \[URL\].

### B.2 Britania Raya *(hanya jika tercantum)*

Perwakilan kami di UK berdasarkan Pasal 27 UK GDPR adalah **\[name, address, email\]**; Anda dapat menghubungi mereka tentang apa pun dalam kebijakan ini. Otoritas pengawasnya adalah **Kantor Komisioner Informasi**, [ico.org.uk](https://ico.org.uk). Anda dapat mengadu kepada kami menggunakan formulir di \[URL\] dan kami mengonfirmasi penerimaan dalam 30 hari. Transfer data Anda dari UK kepada penyedia AI di Amerika Serikat didasarkan pada \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\], dengan dukungan penilaian risiko transfer. Kuki analitik, jika suatu saat kami memasangnya, akan tunduk pada opt-out dan bukan persetujuan di UK; saat ini kami tidak memasangnya. Jika Anda berusia di bawah 18 tahun dan mengakses layanan terlepas dari aturan usia kami, standar Kode Anak ICO berlaku atas cara kami memperlakukan data Anda.

### B.3 Amerika Serikat *(hanya jika tercantum)*

**Pemberitahuan saat pengumpulan.** Tabel dalam bagian 2 mencantumkan setiap kategori informasi pribadi yang kami kumpulkan, tujuannya, dan berapa lama kami menyimpannya (bagian 7). Kami hanya mengumpulkan kategori informasi pribadi *sensitif* berikut jika Anda menyertakannya dalam pertanyaan Anda sendiri: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], dan kami hanya menggunakannya untuk menjalankan debat Anda. **Kami tidak menjual atau membagikan informasi pribadi, dan tidak pernah melakukannya dalam dua belas bulan sebelumnya.** Kami tidak menggunakan informasi pribadi sensitif untuk tujuan apa pun selain menyediakan layanan yang Anda minta. **Sinyal preferensi opt-out:** kami menghormati sinyal Global Privacy Control sebagai permintaan untuk keluar dari penjualan atau pembagian, yang bagaimanapun tidak kami lakukan. **Hak Anda:** mengetahui, menghapus, memperbaiki, melakukan opt-out, membatasi penggunaan informasi pribadi sensitif, dan tidak didiskriminasi karena menggunakannya; ajukan permintaan di privacy@dezbatere.ro atau \[toll-free number / form\]. **Insentif keuangan:** kami tidak menawarkannya; paket gratis dan berbayar tidak berbeda dalam cara kami memperlakukan data Anda. **Retensi** terdapat dalam bagian 7. Pemberitahuan ini diperbarui setidaknya setiap dua belas bulan; terakhir diperbarui \[date\].

*Washington:* **Pemberitahuan Privasi Data Kesehatan Konsumen** kami di \[URL\] merupakan dokumen terpisah yang berlaku atas informasi terkait kesehatan, termasuk inferensi. *Texas dan Nebraska:* kami tidak menjual data pribadi sensitif; jika hal itu berubah, kami akan memperoleh persetujuan Anda terlebih dahulu \[statutory language\]. *Colorado, Connecticut, Virginia, dan negara bagian lain dengan undang-undang privasi komprehensif:* hak di atas berlaku bagi Anda jika hukum berlaku bagi kami; ajukan banding atas permintaan yang ditolak dengan menghubungi \[appeals@dezbatere.ro\].

### B.4 Kanada dan Quebec *(hanya jika tercantum)*

Petugas privasi kami adalah **\[name, email\]**. Kami tetap bertanggung jawab atas informasi pribadi yang kami transfer kepada penyedia AI di luar Kanada, dan menggunakan kontrak untuk mewajibkan perlindungan yang sebanding; penyedia tersebut mungkin tunduk pada hukum negara tempat mereka beroperasi, termasuk akses yang sah oleh otoritas. Email pemasaran hanya dikirim dengan persetujuan tegas Anda berdasarkan CASL. **Quebec:** sebelum menyampaikan informasi pribadi ke luar Quebec, kami melakukan penilaian dampak privasi; pengaturan yang menjaga debat Anda tetap privat diaktifkan secara default; Anda dapat meminta kami menghapus indeks atau berhenti menyebarkan informasi pribadi tentang Anda; Anda dapat meminta data dalam format terstruktur yang umum digunakan; bagian 8 menjelaskan pemrosesan otomatis kami.

### B.5 Australia dan Selandia Baru *(hanya jika tercantum)*

**Australia.** Penerima di luar negeri atas informasi pribadi Anda adalah penyedia AI dan pemroses yang tercantum dalam Daftar, yang berlokasi di \[the United States and the European Union\]; kami mengambil langkah wajar untuk memastikan mereka menanganinya sesuai dengan Prinsip Privasi Australia. **Keputusan otomatis:** mulai 10 Desember 2026, kebijakan ini mengidentifikasi jenis keputusan yang dibuat program komputer yang secara signifikan memengaruhi hak atau kepentingan Anda — tidak ada keputusan semacam itu; skor dan putusan menyangkut argumen, bukan Anda — dan informasi pribadi yang digunakan di dalamnya. Pengaduan dapat diajukan kepada **Kantor Komisioner Informasi Australia**. **Selandia Baru.** Petugas privasi kami adalah \[name\]. Jika kami mengumpulkan informasi pribadi tentang Anda secara tidak langsung — karena pengguna lain menyertakannya dalam pertanyaan — kebijakan ini dan bagian 11 merupakan pemberitahuan yang kami berikan. Kami mengungkapkannya kepada penyedia AI dalam Daftar sebagai agen kami, berdasarkan kontrak yang mewajibkan perlindungan sebanding. Pengaduan dapat diajukan kepada **Kantor Komisioner Privasi**.

### B.6 Amerika Latin *(lampiran berbahasa Spanyol; hanya jika tercantum)*

&#91;Published in Spanish.\] Persetujuan merupakan dasar pemrosesan jika tidak ada keharusan kontrak. Hak ARCO — akses, perbaikan, pembatalan, keberatan — dapat digunakan di privacy@dezbatere.ro dengan tanggapan dalam \[per country\]. *Meksiko:* *aviso de privacidad* lengkap beserta unsur wajibnya tersedia di \[URL\]. *Argentina:* \[AAIP mandatory legend\]; data didaftarkan pada \[…\]. *Kolombia:* *política de tratamiento de datos* kami tersedia di \[URL\]; otoritasnya adalah SIC. *Cile* (mulai 1 Desember 2026): kontak Badan adalah \[…\]; bagian 8 menjelaskan pemrosesan otomatis kami.

### B.7 Teluk — UAE dan Arab Saudi *(hanya jika tercantum)*

Jika kami memproses data Anda untuk tujuan selain menyediakan layanan, kami mengandalkan persetujuan Anda, yang dapat ditarik. Data Anda keluar dari \[UAE / Kingdom of Saudi Arabia\] dan diproses di Uni Eropa dan Amerika Serikat berdasarkan \[SDAIA standard contractual clauses / the mechanism in the Register\]. Pemasaran hanya dikirim dengan persetujuan Anda. Jangan sertakan data pribadi sensitif dalam pertanyaan Anda.

### B.8 Asia-Pasifik *(hanya baris untuk wilayah yang tercantum)*

*Singapura:* Petugas Perlindungan Data kami adalah **\[name, email\]**; transfer didasarkan pada kewajiban kontraktual yang memberikan perlindungan sebanding dengan PDPA; kami memberi tahu PDPC tentang pelanggaran yang wajib diberitahukan dalam 3 hari. *Jepang:* kami menggunakan informasi pribadi Anda untuk tujuan dalam bagian 4 dan bukan yang lain; konten Anda ditransfer kepada penyedia di \[named countries — e.g. the United States\], yang rezim privasi dan perlindungannya dijelaskan dalam Daftar, dan Anda menyetujuinya saat pendaftaran. *Korea Selatan:* Petugas Privasi kami adalah **\[name\]**; item, tujuan transfer, waktu, penerima, tujuan pemrosesan, dan retensi transfer ke luar negeri tercantum dalam Daftar; pendapat politik dalam pertanyaan Anda merupakan informasi sensitif dan kami hanya memprosesnya untuk menjalankan debat Anda; persetujuan untuk pemrosesan opsional dikumpulkan secara terpisah. *India* (setelah aturan DPDP berlaku): pemberitahuan persetujuan mandiri di \[URL\] berlaku; permintaan dijawab dalam 90 hari; pengguna berusia di bawah 18 tahun memerlukan persetujuan orang tua yang dapat diverifikasi. *Filipina:* DPO kami adalah \[name\]; pengaduan dapat diajukan kepada Komisi Privasi Nasional; bagian 8 menjelaskan pemrosesan otomatis. *Thailand:* perwakilan kami adalah \[name\] \[if appointed\].

### B.9 Dicadangkan

Turki, Brasil, dan Indonesia masing-masing memerlukan pemberitahuan berbahasa lokal, perwakilan atau pendaftaran, serta pengajuan, dan belum dirancang di sini. Tiongkok, Vietnam, dan Rusia tidak dilayani.
