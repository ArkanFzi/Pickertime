# Backend Architecture: PocketBase

## 1. Overview
Backend adalah **satu proses PocketBase** (SQLite + file upload) yang berjalan di container
di `hermes-openclaw-vm`, dibuka ke internet lewat **Cloudflare Tunnel dedicated**.
Tidak ada Appwrite, tidak ada PostgreSQL, tidak ada Caddy di jalur ini — dokumen lama
menyebutkan stack tersebut dan sudah tidak berlaku.

## 2. Kenapa PocketBase
- Satu binary, SQLite; cocok untuk workload personal dan backup = salin `pb_data/`.
- Auth + API Rules per-record (`@request.auth.id`) tanpa layer tambahan.
- `pb_hooks` JSVM dipakai untuk proxy Gemini, jadi API key tidak pernah turun ke HP.
- Skema bisa dikodifikasi di `pb_migrations/` sehingga server baru bisa dibangkitkan
  dari repo (lihat `docs/02_migration/pocketbase_schema.md`).

## 3. Komponen
| Komponen | Lokasi | Catatan |
|---|---|---|
| PocketBase 0.40.4 | container di `hermes-openclaw-vm` | port kontainer 8090, tidak diekspos ke host |
| `pb_data` | bind mount volume | SQLite + upload avatar; di-backup, tidak di-commit |
| `pb_hooks/` | bind mount dari repo | `ai_proxy.pb.js` (proxy Gemini, butuh `GEMINI_API_KEY`) |
| `pb_migrations/` | bind mount dari repo | di-apply otomatis saat boot |
| `cloudflared` | container tunnel dedicated | ingress `api.elarisnoir.my.id → http://pocketbase:8090` |

Tunnel harus **dedicated untuk VM ini**. Tunnel yang sama dengan connector di laptop
akan me-load-balance request ke dua mesin, dan mesin yang tidak punya PocketBase
membalikkan 502 sporadis.

## 4. Keamanan
- `GEMINI_API_KEY` hanya ada sebagai environment variable proses PocketBase.
- Dashboard admin PocketBase (`/_/`) ikut tertutup tunnel; akses dari browser hanya
  lewat hostname tunnel dan login superuser.
- Semua koleksi memakai API Rules berbasis `@request.auth.id`; hanya registrasi
  `Profiles` yang publik (`createRule = ""`).

## 5. Historis
Backend lama diproyeksikan ke `api.elarisnoir.my.id` dan mati (523) karena VM
aslinya sudah tidak ada; `pb_data` lama tidak terselamatkan, jadi instance ini
dibangun dari nol dengan skema hasil `pocketbase migrate collections`.
