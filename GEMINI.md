# ⚡ Pickertime — Panduan & Konteks AI

Ekosistem produktivitas AI-powered berbasis **React Native (Expo)** di sisi mobile client dan **PocketBase (Self-hosted)** di sisi backend, dilengkapi integrasi Google Gemini AI via reverse proxy Caddy dan PocketBase JS Hooks.

---

## 🛠️ Tech Stack & Arsitektur

- **Frontend Mobile**: React Native (0.81.5), Expo SDK 54, Expo Router v6, TypeScript 5.9, NativeWind v4 (Tailwind CSS 3.4), Zustand v5, React Native Reanimated v4.
- **Backend**: PocketBase 0.40.4 self-hosted via Docker (`ghcr.io/muchobien/pocketbase:0.40.4`) di VM `hermes-openclaw-vm`.
- **Reverse Proxy**: Cloudflare Tunnel khusus (`pickertime-pb`), SSL termination di edge Cloudflare — tidak ada port publik.
- **AI Engine**: Google Gemini API (`gemini-flash-lite-latest`), diproxy secara aman via PocketBase JS Hook (`pb_hooks/ai_proxy.pb.js`).
- **Automation Bridge**: OpenClaw listener via koleksi `Workspace_Events`.

---

## 📋 Pre-Requisites & Setup Protocol (WAJIB DIPATUHI)

Sebelum mengembangkan fitur, investigasi bug, atau mengubah kode, pastikan checklist berikut terpenuhi:

### 1. Prasyarat Lingkungan Frontend
- **Node.js**: 22.23.2, ditegakkan lewat `.nvmrc` (perkakas uji di `tools/test/` butuh
  node >= 22.18 untuk `import` langsung berkas `.ts`).
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

### 3. Skema Koleksi PocketBase
Empat koleksi aplikasi: `Profiles` (auth), `Tasks`, `Focus_Sessions`, `Workspace_Events`.
Skema TIDAK dibuat manual lewat dashboard `/_/` — ia diproduksi oleh `pb_migrations/`, dan
tabel lengkap + jebakannya ada di `docs/02_migration/pocketbase_schema.md`. Tabel di bawah ini
hanya ringkasan; `npm run test:docs` membandingkannya dengan snapshot koleksi di repo.

| Koleksi | Field yang dipakai aplikasi | Rule list/view/update/delete | Rule create |
|---|---|---|---|
| `Profiles` | `full_name` (Text), `email` (Email), `role` (Select: Student, Professional, Researcher, Creator, Freelancer), `focus_goal` (Text), `energy_pref` (Select: Morning, Afternoon, Night Owl), `avatar_url` (File) | `@request.auth.id != "" && id = @request.auth.id` | `""` — sengaja publik, ini jalur sign-up |
| `Tasks` | `user` (Relation -> `Profiles`), `title` (Text), `description` (Text), `category` (Select: Work, Study, Health, Personal, Other), `priority` (Select: High, Medium, Low), `start_time` (Date), `end_time` (Date), `duration_minutes` (Number), `is_completed` (Bool), `has_alarm` (Bool), `alarm_minutes_before` (Number) | `@request.auth.id != "" && user = @request.auth.id` | `@request.auth.id != "" && user = @request.auth.id` |
| `Focus_Sessions` | `user` (Relation -> `Profiles`), `task` (Relation -> `Tasks`), `duration_seconds` (Number), `completed` (Bool) | `@request.auth.id != "" && user = @request.auth.id` | `@request.auth.id != "" && user = @request.auth.id` |
| `Workspace_Events` | `user` (Relation -> `Profiles`), `event_type` (Text), `occurred_at` (Date), `payload` (JSON), `is_processed` (Bool) | `@request.auth.id != "" && user = @request.auth.id` | `@request.auth.id != "" && user = @request.auth.id` |

`event_type` ditegakkan lewat `pattern`, bukan `select`: mengganti tipe field akan me-DROP
kolomnya (lihat `pb_migrations/1791526402_workspace_events_ketat.js`), dan `npm run test:enum`
menolak nilai event yang ada di kode tapi tidak ada di pola server — atau sebaliknya.

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
