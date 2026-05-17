# 📌 Local Project Snapshot (Pre-Pull Backup)
*Dibuat pada: Mei 2026*

Dokumen ini adalah rekaman aktual (snapshot) dari seluruh fitur, arsitektur, dan perubahan UI yang **saat ini ada di kode lokal Anda**. Dokumen ini dibuat sebagai referensi aman sebelum Anda melakukan `git pull` dari origin main, untuk mengantisipasi jika terjadi *merge conflict*.

---

## 1. 🏗️ Arsitektur & Keamanan Baru
Proyek ini telah sepenuhnya bertransisi dari infrastruktur Supabase lama menuju ekosistem **PocketBase (Self-hosted)** dengan standar keamanan yang lebih tinggi.

*   **Supabase Dihapus:** Seluruh referensi, file SQL (`lib/database.sql`), dan *library* Supabase telah dihilangkan dari kode dan dokumentasi.
*   **Secure AI Proxy:** Fitur Gemini AI kini diproxy melalui server lokal.
    *   Terdapat *script* `pb_hooks/ai_proxy.pb.js` yang harus ditaruh di server PocketBase Anda.
    *   Aplikasi *frontend* (`lib/gemini.ts`) kini memanggil `/api/ai/gemini` menggunakan `pb.send()`, mengamankan `GEMINI_API_KEY` dari *frontend*.
*   **Environment Variables:** File `.env.example` dan `.env` telah disesuaikan agar hanya meminta `EXPO_PUBLIC_PB_URL`.

---

## 2. 📱 Pembaruan UI & User Experience (UX)

### A. Halaman Beranda (`index.tsx`)
*   Slogan aplikasi telah diubah menjadi kalimat yang lebih kuat dan relevan dengan tema produktivitas: **"Your Focus Operating System"**.

### B. Halaman Autentikasi (`sign-in.tsx` & `sign-up.tsx`)
*   **Kursor Input:** Kursor pengetikan kini terlihat jelas menggunakan warna *cyan* (`cursorColor="#00D4FF"`).
*   **Responsivitas Keyboard:** Halaman otomatis menggulung (scroll) menyesuaikan form yang sedang diketik agar tidak tertutup oleh keyboard HP.
*   **Safe Area Padding:** Tombol dan konten bawah disesuaikan agar tidak saling tabrak dengan tombol navigasi sistem/gesture bawaan iOS maupun Android modern.

### C. Navigasi & Tabs (`_layout.tsx`)
*   **Safe Area Insets:** *Bottom tab bar* kini secara otomatis menyesuaikan jarak tingginya dengan indikator *home* atau *gesture bar* pada perangkat *bezel-less* terbaru, menghindari tabrakan fungsi kontrol.

### D. Halaman Timeline / Plan (`timeline.tsx`)
*   **Kalkulasi Waktu:** Durasi pada kotak *Free Slot* sudah menggunakan angka pembulatan (`Math.round`), sehingga tidak ada lagi angka desimal yang terlalu panjang di layar.
*   **Card Overflow Fix:** Teks *subheading* pada *Free Slots Card* kini memiliki properti *flexShrink* dan batasan baris teks. Hal ini mencegah teks panjang mendorong tombol **"Jump to Next"** keluar dari kotak/layar.

---

## 3. 🆕 Fitur Baru: Halaman Profil (`profile.tsx`)
Aplikasi ini sekarang memiliki menu Profil pengguna yang interaktif.
*   Menampilkan data kredensial: Nama, Email, dan Role (misal: Student/Professional).
*   Menampilkan data preferensi bawaan akun: *Focus Goal* dan *Energy Preference*.
*   Menyediakan tombol **Log Out** yang akan menghapus sesi lokal secara bersih dan mengembalikan *user* ke halaman *Welcome*.

---

## 💡 Saran Penanganan Merge Conflict
Jika Anda menjalankan `git pull origin main` dan menemukan *conflict*, Anda dapat merujuk ke dokumen ini untuk memastikan bahwa **semua poin di atas harus dipertahankan** (*Keep Local / Accept Current Changes* pada bagian file yang saya ubah hari ini).
