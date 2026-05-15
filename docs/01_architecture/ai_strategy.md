# AI Strategy: The Hybrid Intelligence System

## 1. Konsep Dasar
Pickertime menggunakan pendekatan **Hybrid AI** di mana kecerdasan dibagi menjadi dua lapis:
1.  **Cloud Intelligence (Gemini AI):** Untuk analisis bahasa, saran produktivitas, dan pembuatan checklist persiapan.
2.  **Local/Edge Intelligence (OpenClaw):** Untuk eksekusi aksi nyata di komputer lokal yang tidak bisa diakses oleh Cloud.

## 2. Alur Kerja (Workflow)
### Skenario: Menyiapkan Sesi Fokus
1.  **User** membuka aplikasi HP dan menekan "Start Focus".
2.  **Aplikasi HP** memanggil Gemini AI untuk membuat 3 langkah persiapan (misal: "Siapkan kopi").
3.  **Aplikasi HP** menulis event `START_FOCUS` ke Database Appwrite.
4.  **OpenClaw** (di PC) mendeteksi event tersebut.
5.  **OpenClaw** menjalankan skrip lokal:
    *   Mengaktifkan DND Windows/Mac.
    *   Membuka VS Code.
    *   Memutar musik Lofi di Spotify.

## 3. Integrasi Gemini (Cloud Functions)
Logika Gemini tidak lagi ditaruh di Supabase Edge Functions, melainkan dideploy sebagai **Appwrite Functions**. Hal ini memudahkan pengelolaan API Key secara terpusat di satu server pribadi Anda.

## 4. Masa Depan: Local LLM
Dengan RAM 32GB, ke depannya Anda bahkan bisa menjalankan model bahasa lokal (seperti **Llama 3 via Ollama**) langsung di server Anda, sehingga Anda benar-benar tidak butuh API Key dari Google lagi untuk tugas-tugas analisis data jadwal.
