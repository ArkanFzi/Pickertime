# Automation Bridge: OpenClaw Setup

## 1. Instalasi OpenClaw
Instal OpenClaw di PC kerja utama Anda (Mac/Linux/Windows WSL2). Pastikan OpenClaw memiliki izin untuk menjalankan skrip sistem.

## 2. Definisi Skill: Workspace Watcher
Buat file skill di OpenClaw (misal: `pickertime.yml`) yang berisi instruksi untuk memantau Database Appwrite Anda setiap 30-60 detik.

### Contoh Logika Skill:
1.  **Cek record terbaru** di koleksi `workspace_events` di mana `is_processed = false`.
2.  Jika ada event `START_FOCUS`:
    *   Ambil `task_title` dan `duration`.
    *   Jalankan perintah sistem: `dnd-on && open-workspace && start-music`.
3.  Ubah status record di Appwrite menjadi `is_processed = true`.

## 3. Komunikasi Dua Arah
Ke depannya, OpenClaw juga bisa mengirim balik data ke Pickertime. 
*Contoh:* OpenClaw mendeteksi Anda terlalu banyak membuka Tab Browser non-kerja. OpenClaw bisa menulis "Warning" ke database yang akan muncul sebagai notifikasi di HP Anda sebagai teguran dari AI Coach.

## 4. Keuntungan Utama
Otomasi ini terjadi di level sistem operasi, sesuatu yang tidak mungkin dilakukan oleh aplikasi HP (Android/iOS) sendirian karena keterbatasan izin *sandbox* aplikasi.
