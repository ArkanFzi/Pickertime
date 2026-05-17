# 🚀 Pickertime Project Roadmap: The Freedom Path

## 1. Project Overview
**Pickertime** adalah ekosistem produktivitas futuristik berbasis AI yang dirancang untuk membantu pengguna mencapai "Deep Focus". Aplikasi ini menggabungkan manajemen tugas, alarm persiapan cerdas (Smart Alarm), dan otomasi lingkungan kerja (Workspace Automation).

## 2. Current State (Legacy)
Saat ini, proyek berada dalam fase transisi dari infrastruktur Cloud pihak ketiga.
*   **Frontend:** React Native (Expo)
*   **Styling:** NativeWind (Tailwind CSS)
*   **Backend:** PocketBase (Self-hosted)
*   **AI Engine:** Google Gemini AI Studio (Proxied securely)
*   **Database:** SQLite (Managed by PocketBase)

## 3. Future Vision (Self-Hosted Architecture)
Target utama adalah kemandirian penuh infrastruktur untuk menghindari batasan platform dan memiliki kontrol 100% atas data pribadi.

*   **Infrastruktur:** Self-hosted di server pribadi (RAM 32GB).
*   **Backend Baru:** **PocketBase** (Berjalan via Docker / Binary).
*   **Otomasi:** Integrasi **OpenClaw** sebagai jembatan antara aplikasi HP dan sistem komputer lokal.
*   **AI Strategy:** Hybrid (Gemini API melalui proxy PocketBase untuk tugas ringan, OpenClaw untuk otomasi sistem berat).

## 4. Migration Plan (Langkah Berikutnya)

### Fase 1: Setup Infrastructure (Server Side)
- [x] Instal Docker / siapkan environment di server pribadi.
- [x] Deploy **PocketBase**.
- [ ] Konfigurasi domain/IP publik untuk akses remote dari aplikasi HP.

### Fase 2: Database Migration
- [x] Selesaikan mapping skema Profil, Tasks, Sessions ke dalam struktur PocketBase.
- [ ] Migrasi data (jika sudah ada data pengguna).

### Fase 3: Code Refactoring
- [x] Gunakan `pocketbase` SDK di dalam proyek Expo.
- [x] Update `.env` dengan URL server baru PocketBase.
- [x] Pindahkan logika Gemini AI ke PocketBase JS Hooks (`pb_hooks`).

### Fase 4: OpenClaw Bridge Optimization
- [ ] Pastikan tabel `workspace_events` aktif di backend baru.
- [ ] Hubungkan OpenClaw di PC lokal ke server PocketBase pribadi.

## 5. System Requirements (Confirmed)
*   **Server RAM:** 32GB (Sangat mencukupi untuk Appwrite + OpenClaw + Monitoring tools).
*   **OS Recommended:** Ubuntu 22.04 LTS / Debian 11+.

---
*Dokumen ini dibuat sebagai panduan teknis transisi Pickertime menuju ekosistem produktivitas yang mandiri.*
