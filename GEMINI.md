# ⚡ Pickertime — Panduan & Konteks AI

Ekosistem produktivitas AI-powered berbasis **React Native (Expo)** di sisi mobile client dan **PocketBase (Self-hosted)** di sisi backend, dilengkapi integrasi Google Gemini AI via reverse proxy Caddy dan PocketBase JS Hooks.

---

## 🛠️ Tech Stack & Arsitektur

- **Frontend Mobile**: React Native (0.81.5), Expo SDK 54, Expo Router v6, TypeScript 5.9, NativeWind v4 (Tailwind CSS 3.4), Zustand v5, React Native Reanimated v4.
- **Backend**: PocketBase (v0.26+) self-hosted via Docker (`ghcr.io/muchobien/pocketbase:latest`) atau Go binary.
- **Reverse Proxy**: Caddy (SSL termination, CORS header, reverse proxy ke port 8090).
- **AI Engine**: Google Gemini API (`gemini-2.0-flash`), diproxy secara aman via PocketBase JS Hook (`pb_hooks/ai_proxy.pb.js`).
- **Automation Bridge**: OpenClaw listener via collection `workspace_events`.

---

## 📋 Pre-Requisites & Setup Protocol (WAJIB DIPATUHI)

Sebelum mengembangkan fitur, investigasi bug, atau mengubah kode, pastikan checklist berikut terpenuhi:

### 1. Prasyarat Lingkungan Frontend
- **Node.js**: v18.x atau v20.x LTS.
- **Dependencies**: `npm install`.
- **Environment Variable**: Buat file `.env` di root project:
  ```env
  EXPO_PUBLIC_PB_URL=http://127.0.0.1:8090
  ```
  *(Catatan: Gunakan IP LAN komputer jika testing dari perangkat fisik HP via Expo Go, atau URL backend remote jika di-deploy).*
- **Jalankan Aplikasi**:
  ```bash
  npx expo start
  ```

### 2. Prasyarat Lingkungan Backend (PocketBase & Caddy)
- **Docker Compose**: Jalankan container PocketBase via `docker compose up -d` (mengacu pada `docker-compose.yml.example`).
- **PocketBase Hook**: Pastikan file `pb_hooks/ai_proxy.pb.js` berada di direktori `pb_hooks/` server PocketBase.
- **Server Environment Variables**:
  - `GEMINI_API_KEY`: Wajib dipasang di environment server OS / container PocketBase. DILARANG menaruh API Key di file `.env` frontend.
  - `PB_ENCRYPTION_KEY`: Kunci enkripsi 32-karakter untuk data PocketBase.
- **Caddy Setup**: Gunakan `Caddyfile.example` untuk domain publik dan konfigurasi CORS header.

### 3. Skema Koleksi PocketBase (Setup Wajib di Dashboard `/_/`)
Pastikan 4 koleksi utama sudah dibuat dengan API Rules yang sesuai:
1. **`profiles`** (atau modifikasi bawaan `users`):
   - Field: `full_name` (Text), `role` (Select: Student, Professional, Researcher, Creator, Freelancer), `focus_goal` (Text), `energy_pref` (Select: Morning, Afternoon, Night Owl).
   - API Rules: `id = @request.auth.id`.
2. **`tasks`**:
   - Field: `user` (Relation -> `profiles`), `title` (Text), `category` (Select: Work, Study, Health, Personal), `start_time` (DateTime), `duration_minutes` (Number), `is_completed` (Bool), `has_alarm` (Bool).
   - API Rules: `user = @request.auth.id`.
3. **`focus_sessions`**:
   - Field: `user` (Relation -> `profiles`), `task` (Relation -> `tasks`, Optional), `duration_seconds` (Number), `completed` (Bool).
   - API Rules: `user = @request.auth.id`.
4. **`workspace_events`**:
   - Field: `user` (Relation -> `profiles`), `event_type` (Text), `payload` (JSON), `is_processed` (Bool, default false).
   - API Rules: `user = @request.auth.id`.

---

## 🗄️ Database Workflow (PocketBase / SQLite)

1. **Penyimpanan Lokal & Data Safety**:
   - Database disimpan di direktori `./pb_data` (SQLite database).
   - Direktori `pb_data/` **DILARANG KERAS** di-commit ke Git repo (wajib selalu ada di `.gitignore`).
   - Wajib backup folder `pb_data` sebelum melakukan perubahan skema atau migration struktural.
2. **Skema Migrasi (`pb_migrations/`)**:
   - Gunakan fitur export PocketBase migrations untuk perubahan skema database agar dapat direproduksi antar environment (dev, staging, production GCP).
3. **API Rules & RLS Equivalent**:
   - Semua akses query dari aplikasi wajib melewati authenticated session (`@request.auth.id`).
   - Jangan pernah membuka API Rules menjadi publik (`""`) kecuali untuk endpoint registrasi dan login.
4. **Testing Data**:
   - Dilarang mengasumsikan data transaksi riil ada di local dev. Gunakan mock data lokal pada Zustand store jika server belum terhubung.

---

## 🦊 Git & GitHub Workflow (Pola Inafood)

Alur kerja Git mengadopsi model multi-tier branch seperti pada repo inafood, dengan pemisahan tegas antara branch integrasi dan produksi deployment.

```
       [feat/fix branch]
              │
              ▼ (PR / Merge)
           ┌─────┐
           │ dev │ ◄── Development & Staging Integration Base
           └─────┘
              │
              ▼ (PR rilis setelah lolos verifikasi)
          ┌──────┐
          │ main │ ◄── Production Release & Deploy Backend ke GCP
          └──────┘
```

### 1. Struktur Branch
- **`dev`**: Branch pengembangan harian & integrasi fitur. Semua pengerjaan fitur baru dan bugfix WAJIB bercabang dari branch `dev`.
- **`main`**: Branch produksi. Khusus untuk deployment backend (PocketBase + Caddy) ke **Google Cloud Platform (GCP)** (Cloud Run / Compute Engine VM). DILARANG commit langsung ke `main`.
- **`feat/<nama-fitur>` / `fix/<nama-bug>`**: Branch tugas spesifik yang dibuat dari branch `dev`.

### 2. Standar Commit (Conventional Commits)
Wajib menggunakan prefix standar:
- `feat:` Penambahan fitur baru.
- `fix:` Perbaikan bug.
- `refactor:` Restrukturisasi kode tanpa mengubah fungsionalitas.
- `docs:` Pembaruan dokumentasi.
- `style:` Format, whitespace, styling tanpa ubah logika.
- `test:` Penambahan atau perbaikan unit test.
- `chore:` Maintenance config, dependency, build script.

### 3. Alur Pengerjaan & Deployment
1. Buat branch tugas baru dari `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feat/nama-fitur
   ```
2. Kerjakan kode, pastikan lolos validasi tipe:
   ```bash
   npx tsc --noEmit
   ```
3. Commit dengan Conventional Commits.
4. Push branch fitur dan buat Pull Request (PR) mengarah ke branch `dev`.
5. Setelah fitur stabil dan diverifikasi di `dev`, buat Pull Request dari `dev` ke `main`.
6. Merge ke `main` mentrigger pipeline deployment backend ke GCP.

---

## 🔒 Aturan Keamanan & Kualitas Kode

- **No Hardcode Secrets**: API key (Gemini, PocketBase auth token, encryption key) dilarang berada di source code client.
- **Integritas Konfigurasi Lokal**: Konfigurasi local-only (seperti `.env` pribadi) tidak boleh ter-commit.
- **Auto-Verify**: Selalu jalankan `npx tsc --noEmit` sebelum melaporkan tugas selesai.
