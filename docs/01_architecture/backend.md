# Backend Architecture: Appwrite & PostgreSQL

## 1. Overview
Kita akan menggunakan **Appwrite** sebagai orkestrator backend utama yang berjalan di atas Docker di server pribadi Anda. Appwrite akan menangani autentikasi, manajemen database, dan eksekusi fungsi AI (Cloud Functions).

## 2. Kenapa Appwrite?
*   **PostgreSQL Support:** Appwrite menggunakan PostgreSQL untuk menyimpan metadata dan mendukung skema relasional yang kompleks.
*   **Security:** Menyediakan layer keamanan (RLS-like) melalui "Document Level Permissions".
*   **Performance:** Dengan RAM 32GB, kita bisa mengoptimalkan cache PostgreSQL untuk akses data tugas yang instan.

## 3. Komponen Utama Backend
*   **Auth:** Menangani pendaftaran dan login (Student, Professional, etc).
*   **Databases:** 
    *   `Main_DB`: Berisi koleksi `Profiles`, `Tasks`, dan `Focus_Sessions`.
    *   `Automation_DB`: Berisi `Workspace_Events` untuk OpenClaw.
*   **Functions:** 
    *   `gemini-proxy`: Fungsi Node.js/Bun yang memanggil Google Gemini API.
    *   `cleanup-tasks`: Fungsi terjadwal untuk membersihkan tugas lama.

## 4. Konfigurasi Server (Rekomendasi)
*   **Port:** 80/443 (HTTP/HTTPS) untuk koneksi aplikasi HP.
*   **Volume:** Pastikan volume Docker diarahkan ke storage utama server Anda untuk persistensi data.
