# Rekap Harian Kasir

Aplikasi web (PWA) untuk rekap stok, penjualan, cash, QRIS dan pengeluaran harian.
Data disimpan di **Supabase**, di-hosting gratis di **GitHub Pages**, bisa di-install di HP / tablet / komputer, dan tampilannya menyesuaikan ukuran layar.

## Isi folder
```
index.html              halaman aplikasi
app.js                  logika aplikasi
config.js               <-- ISI URL & KEY SUPABASE DI SINI
sw.js                   service worker (agar bisa di-install / dibuka cepat)
manifest.webmanifest    pengaturan PWA
icons/                  ikon aplikasi
supabase.sql            skema database (instalasi baru)
supabase_update.sql     pembaruan database (jika sudah pernah menjalankan versi lama)
.nojekyll               agar GitHub Pages memakai file apa adanya
```

## Langkah 1 - Siapkan Supabase
1. Buat project di https://supabase.com
2. Buka **SQL Editor** -> New query, tempel isi `supabase.sql`, klik **Run**.
   (Jika sebelumnya sudah menjalankan versi lama, jalankan `supabase_update.sql` saja.)
3. Buka **Project Settings -> API**, salin **Project URL** dan **anon public key**.
4. Isi keduanya di `config.js`:
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://xxxxxxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJ...."
   };
   ```

## Langkah 2 - Upload ke GitHub
**Lewat website (paling mudah, bisa dari HP):**
1. Buka https://github.com/new, beri nama repository (mis. `rekap-kasir`), pilih **Public**, klik **Create repository**.
2. Klik **uploading an existing file**, lalu seret **semua isi folder** (termasuk folder `icons` dan file `.nojekyll`) - atau upload isi zip setelah di-extract.
3. Klik **Commit changes**.

**Lewat terminal:**
```bash
git init && git add -A && git commit -m "Rekap Kasir"
git branch -M main
git remote add origin https://github.com/USERNAME/rekap-kasir.git
git push -u origin main
```

## Langkah 3 - Aktifkan GitHub Pages
1. Di repository: **Settings -> Pages**.
2. **Source:** Deploy from a branch -> branch `main`, folder `/ (root)` -> **Save**.
3. Tunggu 1-2 menit. Aplikasi tersedia di `https://USERNAME.github.io/rekap-kasir/`.
4. Setiap kali Anda mengubah file di GitHub, website otomatis ikut diperbarui.

## Install di perangkat
| Perangkat | Cara |
|---|---|
| **Android** (Chrome) | Buka alamat web -> tombol **Install Aplikasi** di aplikasi, atau menu titik tiga -> *Install app / Tambahkan ke layar utama* |
| **iPhone / iPad** (Safari) | Buka alamat web -> tombol **Bagikan** -> **Tambah ke Layar Utama** |
| **Windows / Mac / Linux** (Chrome / Edge) | Klik ikon install di kolom alamat, atau tombol **Install Aplikasi** |

Tampilan otomatis menyesuaikan: tabel lebar di komputer, kolom bertumpuk dan nama barang tetap terlihat saat digeser di HP.
Penyimpanan butuh internet; jika offline, aplikasi tetap terbuka tetapi data belum bisa disimpan.

## Cara pakai
- **Menu Produk**: tambah nama produk dan harga jual; otomatis menjadi daftar "Nama Barang" dan "Harga Produk" di rekap.
- **Rekap Harian**: tanggal otomatis menunjuk ke hari setelah data terakhir. Isi data lalu klik **SUBMIT**; data tersimpan sesuai tanggal dan tanggal pindah ke hari berikutnya.
- "Jumlah" hari baru terisi dari Sisa Stok hari sebelumnya, dan tetap bisa diubah.
- Pilih tanggal lama untuk melihat/mengoreksi (submit ulang = menimpa).
- Tanggal yang sudah tersimpan memakai harga saat disimpan; tombol **Pakai Harga Terbaru** menerapkan harga baru.

## Rumus
- Isi manual: Jumlah (total awal), Masuk, Keluar, KDS/TPH, Sisa Stok, Cash, QRIS, Pengeluaran, dan kotak MINUS RILL di atas
- Total = Jumlah + Masuk - Keluar - KDS/TPH
- Total Terjual = Total - Sisa Stok
- Total Terjual Dalam Bentuk Uang = Total Terjual x Harga Produk
- Total All Sebelum Pengeluaran = Cash + QRIS; Sesudah Pengeluaran = Cash + QRIS - Pengeluaran
- Kotak LEBIH/MINUS di TOTAL ALL = Cash + QRIS + Pengeluaran - Total Terjual (Uang)

## Keamanan
Aplikasi belum memakai login: siapa pun yang tahu alamat websitenya bisa membaca dan mengubah data.
Anon key memang aman ditaruh di repository, tetapi untuk keamanan lebih aktifkan Supabase Auth dan ganti `to anon` menjadi `to authenticated` di policy `supabase.sql`.
