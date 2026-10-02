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
| `cloudflared` | container tunnel dedicated | ingress `api.elarisnoir.my.id → http://pickertime-pocketbase:8090` |

Tunnel harus **dedicated untuk VM ini**. Tunnel yang sama dengan connector di laptop
akan me-load-balance request ke dua mesin, dan mesin yang tidak punya PocketBase
membalikkan 502 sporadis.

## 4. Keamanan
- `GEMINI_API_KEY` hanya ada sebagai environment variable proses PocketBase.
- Dashboard admin PocketBase (`/_/`) ikut tertutup tunnel; akses dari browser hanya
  lewat hostname tunnel dan login superuser.
- Semua koleksi memakai API Rules berbasis `@request.auth.id`; hanya registrasi
  `Profiles` yang publik (`createRule = ""`).

## 5. Runbook (hermes-openclaw-vm)
Akses VM: `gcloud compute ssh hermes-openclaw-vm --zone=us-central1-a --tunnel-through-iap`.

| Path di VM | Isi |
|---|---|
| `/opt/pickertime/pb_data/` | SQLite + upload (satu-satunya state; backup = salin direktori ini) |
| `/opt/pickertime/app/pb_hooks/` | hook dari repo |
| `/opt/pickertime/app/pb_migrations/` | snapshot skema dari repo |
| `/opt/pickertime/.env` | `GEMINI_API_KEY`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` (mode 600, jangan di-commit) |
| `/opt/pickertime/superuser.txt` | kredensial superuser hasil generate (mode 600) |
| `/opt/pickertime/cloudflared/` | `cert.pem`, `config.yml`, credentials tunnel `e28d5fdc-…` (mode 600/700, owner uid 65532) |

Container: `pickertime-pocketbase` (network `openclaw-docker_default`, tanpa published port)
dan `pickertime-cloudflared`, keduanya `--restart unless-stopped`.

Deploy ulang hook/skema dari laptop:
```bash
gcloud compute scp pb_hooks/ai_proxy.pb.js hermes-openclaw-vm:/home/arkan/stage/ \
  --zone=us-central1-a --tunnel-through-iap
gcloud compute ssh hermes-openclaw-vm --zone=us-central1-a --tunnel-through-iap \
  --command="sudo cp /home/arkan/stage/ai_proxy.pb.js /opt/pickertime/app/pb_hooks/ && sudo docker restart pickertime-pocketbase"
```
Cocokkan `sha256sum` kedua sisi sebelum menyatakan deploy berhasil — `scp` lewat IAP pernah
gagal diam-diam karena DNS laptop sedang tidak resolves.

Verifikasi setelah deploy (health, skema, CRUD, isolasi antar user, proxy AI live, lalu hapus
semua baris uji):
```bash
PB_SU_EMAIL=... PB_SU_PASSWORD=... node tools/pb/pb-prod-smoke.mjs https://api.elarisnoir.my.id
```
`tools/pb/pb-schema-verify.mjs` untuk CI punya cakupan yang sama tetapi meninggalkan baris uji,
jadi jangan diarahkan ke database produksi.

Catatan model Gemini: upstream sudah memensiunkan `gemini-2.0-flash` dan `gemini-2.5-flash`
(404), dan `gemini-flash-latest` terbukti sedang `RESOURCE_EXHAUSTED`. Hook memakai
`gemini-flash-lite-latest` yang lolos 5/5 probe.

## 6. Historis
Backend lama diproyeksikan ke `api.elarisnoir.my.id` dan mati (523) karena VM
aslinya sudah tidak ada; `pb_data` lama tidak terselamatkan, jadi instance ini
dibangun dari nol dengan skema hasil `pocketbase migrate collections`.
