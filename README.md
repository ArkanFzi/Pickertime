# ⚡ Pickertime: AI-Powered Productivity Ecosystem

[![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![PocketBase](https://img.shields.io/badge/PocketBase-B8D2F2?style=for-the-badge&logo=pocketbase&logoColor=black)](https://pocketbase.io/)
[![Caddy](https://img.shields.io/badge/Caddy-00ADD8?style=for-the-badge&logo=caddy&logoColor=white)](https://caddyserver.com/)
[![Gemini](https://img.shields.io/badge/Gemini%20AI-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white)](https://deepmind.google/technologies/gemini/)

**Pickertime** bukan sekadar pengatur waktu (timer) biasa. Ini adalah ekosistem produktivitas futuristik yang menggunakan kecerdasan buatan (Gemini AI) untuk menganalisis performa Anda, menjadwalkan tugas tanpa bentrok, dan memberikan peringatan persiapan cerdas (Smart Alarm) tepat sebelum Anda memulai sesi fokus.

---

## ✨ Fitur Unggulan

### 🧠 AI Productivity Insights
Hubungkan data riil Anda ke Gemini AI untuk mendapatkan analisis mendalam. Lihat tren mingguan, heatmap produktivitas, dan saran aksi berikutnya (Next Best Action) yang disesuaikan khusus dengan profil Anda.

### 🔔 Smart Alarm & AI Prep
Dapatkan notifikasi sistem **10 menit** sebelum tugas dimulai. Saat diketuk, AI akan secara dinamis membuat checklist persiapan (misal: "Siapkan kopi", "Matikan notifikasi HP") berdasarkan jenis tugas yang akan Anda kerjakan.

### ⚠️ Real-Time Conflict Detection
Jangan pernah lagi melakukan *double-booking*. Saat membuat jadwal, Pickertime secara otomatis mendeteksi bentrok waktu dan menyarankan slot kosong (Next Available Slot) tercepat agar jadwal Anda tetap optimal.

### 🌊 Deep Focus Mode
Masuk ke mode fokus yang imersif dengan desain *glassmorphism* yang menenangkan. Dilengkapi dengan *Breathing Glow* dan mode *Shield* (DND) untuk menjaga Anda tetap di zona puncak performa.

### 📅 Dynamic Timeline
Visualisasi hari Anda dalam bentuk timeline yang bersih. Aplikasi secara otomatis mengidentifikasi celah waktu (Free Slots) dan memungkinkan Anda mengisinya hanya dengan satu ketukan.

---

## 🛠️ Tech Stack

- **Frontend:** React Native with [Expo SDK](https://expo.dev/)
- **Styling:** Vanilla CSS (Refactored for performance)
- **Backend:** [PocketBase](https://pocketbase.io/) (Self-hosted via Docker)
- **Reverse Proxy:** [Caddy](https://caddyserver.com/)
- **Intelligence:** [Google Gemini API](https://ai.google.dev/) (Direct Integration)
- **State Management:** Zustand

---

## 🚀 Instalasi & Setup

### 1. Clone Repositori
```bash
git clone https://github.com/ArkanFzi/Pickertime.git
cd Pickertime
```

### 2. Instal Dependensi
```bash
npm install
```

5. Konfigurasi Environment Variables
Buat file `.env` di root direktori untuk koneksi aplikasi ke Supabase:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

6. Konfigurasi AI (Supabase Edge Functions)
Gemini API Key sekarang diamankan di server (Supabase). Untuk mengaturnya, jalankan perintah ini di Supabase CLI:
```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

### 4. Jalankan Aplikasi
```bash
npx expo start
```
Gunakan aplikasi **Expo Go** di HP Anda atau jalankan di emulator.

---

## 📊 Struktur Database (Supabase)

Aplikasi ini menggunakan skema database berikut untuk sinkronisasi data:

- `profiles`: Menyimpan data user, role (Student, Professional, etc), dan status izin.
- `tasks`: Menyimpan daftar rencana tugas, durasi, dan kategori.
- `focus_sessions`: Log riwayat sesi fokus untuk analisis performa AI.

---

## 🤝 Kontribusi

Kontribusi selalu diterima! Jika Anda menemukan bug atau ingin menambahkan fitur baru:
1. Fork repositori ini.
2. Buat branch baru (`git checkout -b feature/AmazingFeature`).
3. Commit perubahan Anda (`git commit -m 'Add AmazingFeature'`).
4. Push ke branch tersebut (`git push origin feature/AmazingFeature`).
5. Buka Pull Request.

---

## 📄 Lisensi

Didistribusikan di bawah lisensi MIT. Lihat `LICENSE` untuk informasi lebih lanjut.

---
*Created with ❤️ by [ArkanFzi](https://github.com/ArkanFzi)*
