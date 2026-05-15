# 🚀 Pickertime Project Roadmap: The Freedom Path

## 1. Project Overview
**Pickertime** adalah ekosistem produktivitas futuristik berbasis AI yang dirancang untuk membantu pengguna mencapai "Deep Focus". Aplikasi ini menggabungkan manajemen tugas, alarm persiapan cerdas (Smart Alarm), dan otomasi lingkungan kerja (Workspace Automation).

## 2. Current State (Legacy)
Saat ini, proyek berada dalam fase transisi dari infrastruktur Cloud pihak ketiga.
*   **Frontend:** React Native (Expo)
*   **Styling:** NativeWind (Tailwind CSS)
*   **Backend (Lama):** Supabase Cloud (Database, Auth, Edge Functions)
*   **AI Engine:** Google Gemini AI Studio
*   **Database:** PostgreSQL (Managed by Supabase)

## 3. Future Vision (Self-Hosted Architecture)
Target utama adalah kemandirian penuh infrastruktur untuk menghindari batasan platform dan memiliki kontrol 100% atas data pribadi.

*   **Infrastruktur:** Self-hosted di server pribadi (RAM 32GB).
*   **Backend Baru:** **Appwrite** (Berjalan via Docker).
*   **Otomasi:** Integrasi **OpenClaw** sebagai jembatan antara aplikasi HP dan sistem komputer lokal.
*   **AI Strategy:** Hybrid (Gemini API untuk tugas ringan, OpenClaw untuk otomasi sistem berat).

## 4. Migration Plan (Langkah Berikutnya)

### Fase 1: Setup Infrastructure (Server Side)
- [ ] Instal Docker & Docker Compose di server pribadi.
- [ ] Deploy **Appwrite** menggunakan perintah resmi.
- [ ] Konfigurasi domain/IP publik untuk akses remote dari aplikasi HP.

### Fase 2: Database Migration
- [ ] Mapping ulang skema PostgreSQL Supabase (Profi, Tasks, Sessions) ke dalam struktur Database Appwrite.
- [ ] Migrasi data (jika sudah ada data pengguna).

### Fase 3: Code Refactoring
- [ ] Ganti library `@supabase/supabase-js` dengan `appwrite` SDK di dalam proyek Expo.
- [ ] Update `.env` dengan URL server baru dan Project ID Appwrite.
- [ ] Pindahkan logika Gemini AI dari Supabase Edge Functions ke Appwrite Functions.

### Fase 4: OpenClaw Bridge Optimization
- [ ] Pastikan tabel `workspace_events` aktif di backend baru.
- [ ] Hubungkan OpenClaw di PC lokal ke server Appwrite pribadi.

## 5. System Requirements (Confirmed)
*   **Server RAM:** 32GB (Sangat mencukupi untuk Appwrite + OpenClaw + Monitoring tools).
*   **OS Recommended:** Ubuntu 22.04 LTS / Debian 11+.

---
*Dokumen ini dibuat sebagai panduan teknis transisi Pickertime menuju ekosistem produktivitas yang mandiri.*
