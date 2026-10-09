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

### 3. Jalankan Backend PocketBase
Skema sudah dikodifikasi di `pb_migrations/` dan diterapkan otomatis saat boot, jadi tidak
perlu membuat koleksi manual di Dashboard:
```bash
docker run -d --name pickertime-pb -p 127.0.0.1:8090:8090 \
  -e PB_ADMIN_EMAIL=you@example.com \
  -e PB_ADMIN_PASSWORD=password-admin-anda \
  -e GEMINI_API_KEY=your_gemini_api_key \
  -v "$PWD/pb_data:/pb_data" \
  -v "$PWD/pb_hooks:/pb_hooks" \
  -v "$PWD/pb_migrations:/pb_migrations" \
  ghcr.io/muchobien/pocketbase:0.40.4
```

### 4. Konfigurasi Environment Variables (frontend)
Buat file `.env` di root direktori untuk koneksi aplikasi ke PocketBase:
```env
EXPO_PUBLIC_PB_URL=http://192.168.1.15:8090
```
Ganti dengan IP LAN komputer Anda kalau mengaksesnya dari HP/emulator.

### 5. Konfigurasi AI
`GEMINI_API_KEY` hanya ada di sisi server PocketBase (lihat langkah 3) dan tidak pernah
masuk ke bundle aplikasi. Proxy-nya ada di `pb_hooks/ai_proxy.pb.js`.
Kalau key tidak dipasang, `POST /api/ai/complete` membalas 400
`"GEMINI_API_KEY is not configured on the server."` — fitur lain tetap jalan.
Jalur lama `POST /api/ai/gemini` masih terdaftar dan membalas 410 `code: "moved"`
(untuk build yang belum di-rebuild dan untuk gerbang agen di VM).

### 6. Verifikasi
```bash
npm run typecheck
PB_SU_EMAIL=you@example.com PB_SU_PASSWORD=password-admin-anda \
  node tools/pb/pb-schema-verify.mjs http://127.0.0.1:8090 lokal
```

### 7. Jalankan Aplikasi
```bash
npx expo start
```
Gunakan aplikasi **Expo Go** di HP Anda atau jalankan di emulator.

---

## 📱 Build Mobile (EAS)
Profil build ada di `eas.json` (`development`, `preview`, `production`). Sebelum build
pertama:
```bash
npx eas-cli config      # cek nilai yang akan dipakai build
npx eas-cli build -p android --profile preview
```
Dua hal yang masih wajib Anda isi sendiri (butuh akun Expo, tidak bisa saya kerjakan):
1. `npx eas-cli init` untuk membuat `extra.eas.projectId` di `app.json`.
2. `android.package` (mis. `id.co.pickertime`) dan `ios.bundleIdentifier` di `app.json`;
   tanpa keduanya EAS menolak build.

`EXPO_PUBLIC_PB_URL` di-inject per profil dari `eas.json`. Nilai itu ikut terkompilasi ke
dalam biner, jadi ganti profile production kalau hostname backend berubah dan build ulang.
---

## 📊 Struktur Database (PocketBase)

Empat koleksi, definisinya ada di `pb_migrations/` dan rinciannya di
`docs/02_migration/pocketbase_schema.md`:

- `Profiles` (auth): data user, `role`, `focus_goal`, `energy_pref`, `avatar_url`.
- `Tasks`: rencana tugas, `start_time`/`end_time`, durasi, prioritas, alarm.
- `Focus_Sessions`: log sesi fokus untuk analisis performa.
- `Workspace_Events`: event jembatan OpenClaw (`event_type` + `payload` JSON).

Setiap koleksi dibatasi API Rules `@request.auth.id`; hanya registrasi `Profiles` yang publik.

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
*Created by [ArkanFzi](https://github.com/ArkanFzi)*
