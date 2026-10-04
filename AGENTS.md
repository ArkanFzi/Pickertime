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

### ⚠️ Invarian Kredensial Superuser PocketBase (M8.1)

**Setelah `docker restart pickertime-pocketbase`, kredensial superuser = nilai env container.**

Image `ghcr.io/muchobien/pocketbase:0.40.4` mencetak `Successfully saved superuser "…"!` pada
**setiap** start, dan sumber nilainya adalah env **container** (`PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`),
bukan file `.env` atau `superuser.txt` di host.

**Implikasi untuk rotasi password**:
- Nilai baru **WAJIB** masuk ke `--env-file` sebelum `docker run` ulang (atau update systemd service).
- Kalau hanya diubah lewat API/dashboard PocketBase, restart berikutnya akan **menimpanya** dan
  memutus semua alat yang memakai kredensial lama (backup script, smoke test, deploy hooks).

**Bukti terukur** (temuan 2026-10-03):
- Container env: `PB_ADMIN_PASSWORD len=48`
- File `.env` + `superuser.txt`: `PB_ADMIN_PASSWORD len=24` (nilai lama, dipasang via API setelah start)
- `mtime superuser.txt = Oct 2 11:37`, container start terakhir `Oct 2 04:34` → nilai 24 itu dipasang
  **setelah** start, jadi hanya menang sampai restart berikutnya.
- Backup putus secara diam-diam pada 2026-10-03 karena password kembali ke nilai env container.

**Aturan**: Jangan pernah `docker restart` manual tanpa membaca invariant ini. Kalau perlu rotasi
password, ubah env container dulu, baru restart.

---

## 🦊 Git & GitHub Workflow (Pola Inafood)

- **Branch `dev`**: Base branch pengembangan dan staging. Semua branch fitur/bugfix WAJIB bercabang dari `dev`.
  Ditegakkan (2026-10-02): branch protection aktif, `allow_force_pushes=false`,
  `allow_deletions=false`, tidak ada required status check → push langsung oleh pemilik masih jalan.
- **Branch `main`**: Production deployment branch. DILARANG push langsung ke `main` — bukan cuma aturan
  tertulis: `enforce_admins=true`, `required_pull_request_reviews=0 approval`, required checks
  `Type-check` + `Skema PocketBase + hook AI`. Push langsung ditolak GitHub dengan
  `GH006: Changes must be made through a pull request`.
  **Catatan jujur**: klaim "khusus untuk deploy backend ke GCP" belum punya pipa — satu-satunya
  workflow di `.github/workflows/` adalah `ci.yml` (job `typecheck`, `schema`, `guard-main`),
  tidak ada job deploy. Jalur produksi nyata sampai hari ini: PocketBase jalan di VM
  (`api.elarisnoir.my.id`) dan aplikasi mobile memakai profil EAS. Lihat `TODO.md` M4.
- **Branch Tasks**: `feat/<nama-fitur>` atau `fix/<nama-bug>` (dibuat dari `dev`).
- **Alur PR**: `feat/*` -> PR -> `dev` (staging) -> PR -> `main`.
- **Tidak ada branch `production`**: cabang itu dihapus 2026-10-02 setelah kerja uniknya
  (`app/edit-task.tsx`) dilebur ke `dev` lewat PR #1; jaring pengaman ada di tag
  `archive/production-20260517` dan `docs/archive/production-20260517/`.
- **Conventional Commits**: Wajib gunakan `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`.
- **Claude Guard**: DILARANG menambahkan suffix `%claude%` pada nama commit atau branch.

---

## 🔒 Strict Rules
- **No Hardcode Secrets**: Dilarang memasukkan API key atau token ke dalam kode client.
- **Auto-Verify**: Wajib jalankan verifikasi tipe `npx tsc --noEmit` sebelum menyelesaikan tugas.
