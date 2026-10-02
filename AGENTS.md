# ⚡ Pickertime — Agent Directives & Universal Rules

Universal instruction file untuk semua Autonomous AI Coding Agents (Gemini, Claude, Codex, GPT).

---

## 🛠️ Stack & Context Singkat

- **App**: Mobile AI Productivity Tracker & Smart Alarm.
- **Frontend**: React Native, Expo SDK 54, Expo Router v6, TypeScript, NativeWind v4, Zustand.
- **Backend**: PocketBase 0.40.4 (Docker image `ghcr.io/muchobien/pocketbase:0.40.4`), Cloudflare Tunnel, Google Gemini API Proxy (`pb_hooks/ai_proxy.pb.js`). SDK aplikasi `pocketbase@0.26.9` — sudah diverifikasi identik perilakunya melawan server 0.26.6 dan 0.40.4.
- **Target Deployment**: Backend di-deploy ke **Google Cloud Platform (GCP)** via branch `main`.

---

## 📋 Pre-Requisites Checklist

Sebelum memulai pengerjaan kode/bug:
1. Pastikan dependensi frontend terpasang (`npm install`).
2. Pastikan file `.env` terkonfigurasi (`EXPO_PUBLIC_PB_URL=http://127.0.0.1:8090`). `lib/pocketbase.ts` juga masih menerima `EXPO_PUBLIC_POCKETBASE_URL`, tapi nama bakunya `EXPO_PUBLIC_PB_URL` (sama dengan `.env.example` dan `README.md`).
3. Pastikan backend PocketBase aktif dan `pb_hooks/ai_proxy.pb.js` terpasang.
4. Pastikan `GEMINI_API_KEY` terkonfigurasi di server host PocketBase, bukan di frontend.
5. Verifikasi 4 koleksi PocketBase: `Profiles`, `Tasks`, `Focus_Sessions`, `Workspace_Events` (lihat `docs/02_migration/pocketbase_schema.md`).

---

## 🗄️ Database Workflow (PocketBase / SQLite)

1. SQLite database berada di `./pb_data` dan **WAJIB di-ignore oleh Git**.
2. Backup `pb_data` sebelum modifikasi skema atau eksekusi migration.
3. Gunakan PocketBase migrations (`pb_migrations/`) untuk migrasi skema yang reproduktif.
4. Terapkan API Rules ketat berbasis `@request.auth.id` pada seluruh koleksi.

---

## 🦊 Git & GitHub Workflow (Pola Inafood)

- **Branch `dev`**: Base branch pengembangan dan staging. Semua branch fitur/bugfix WAJIB bercabang dari `dev`.
- **Branch `main`**: Production deployment branch. Khusus untuk deploy backend ke GCP. DILARANG push langsung ke `main`.
- **Branch Tasks**: `feat/<nama-fitur>` atau `fix/<nama-bug>` (dibuat dari `dev`).
- **Alur PR**: `feat/*` -> PR -> `dev` (staging) -> PR -> `main` (trigger GCP backend deployment).
- **Conventional Commits**: Wajib gunakan `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`.
- **Claude Guard**: DILARANG menambahkan suffix `%claude%` pada nama commit atau branch.

---

## 🔒 Strict Rules
- **No Hardcode Secrets**: Dilarang memasukkan API key atau token ke dalam kode client.
- **Auto-Verify**: Wajib jalankan verifikasi tipe `npx tsc --noEmit` sebelum menyelesaikan tugas.
