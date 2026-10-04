# Backend Architecture: PocketBase

## 1. Overview
Backend adalah **satu proses PocketBase** (SQLite + file upload) yang berjalan di container
di `hermes-openclaw-vm`, dibuka ke internet lewat **Cloudflare Tunnel dedicated**.
Tidak ada Appwrite, tidak ada PostgreSQL, tidak ada Caddy di jalur ini — dokumen lama
menyebutkan stack tersebut dan sudah tidak berlaku.

## 2. Kenapa PocketBase
- Satu binary, SQLite; cocok untuk workload personal dan state-nya cuma satu direktori.
  Backupnya tetap lewat API `/api/backups`, bukan `cp` (lihat §6).
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
- `GEMINI_API_KEY` hanya ada sebagai environment variable proses PocketBase (`/opt/pickertime/.env`, mode 600).
- Dashboard admin PocketBase (`/_/`) **diblokir di edge Cloudflare**: aturan ingress
  `hostname: api.elarisnoir.my.id, path: ^/_ → http_status:404` dipasang lebih dulu dari
  aturan service, jadi request ke dashboard tidak pernah mencapai origin. Diverifikasi:
  `/_/` → 404, `/api/health` → 200, smoke test tetap `SMOKE PASS`.
- Administrasi lewat CLI/API saja: `sudo docker exec pickertime-pocketbase pocketbase superuser ... --dir=/pb_data`
  atau `POST /api/collections/_superusers/auth-with-password` (field-nya `identity`, bukan `email`).
  Kalau dashboard butuh dibuka sementara, pindahkan aturan `^/_` ke bawah / hapus dari
  `config.yml` lalu `sudo docker restart pickertime-cloudflared`; simpanannya ada di
  `config.yml.bak` dan `config.yml` (mode 600, owner uid 65532).
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

## 6. Backup pb_data
Rantai backupnya lewat tiga titik, sumbernya semua ada di `tools/backup/`:

```
hermes-openclaw-vm  --(1) POST /api/backups-->  zip di pb_data/backups/
                  --(2) publish base64-->  topic Pub/Sub pickertime-pb-backups
agentic-watchdog-vm --(3) pull + gcloud storage cp-->  gs://pickertime-pb-backups/YYYY/MM/<key>.zip
```

Kenapa berputar lewat Pub/Sub, bukan `gcloud storage cp` langsung dari hermes: token
metadata hermes hanya punya scope `devstorage.read_only` (dibaca dari
`.../service-accounts/default/scopes`), jadi upload ke GCS selalu ditolak
`Provided scope(s) are not authorized`. Mengubah scope butuh stop/start instance =
mematikan PocketBase dan tunnel-nya sebentar, jadi dipilih relay ke
`agentic-watchdog-vm` yang scope-nya `cloud-platform`. Tidak ada kredensial baru yang
perlu disimpan di disk.

| Item | Nilai |
|---|---|
| Timer backup | `pickertime-pb-backup.timer` di hermes, harian 03:17 UTC (`Persistent=true`) |
| Timer relay | `pickertime-pb-relay.timer` di watchdog, tiap 15 menit |
| Bucket | `gs://pickertime-pb-backups` (US-CENTRAL1, uniform access, lifecycle hapus >30 hari) |
| Topic/subscription | `pickertime-pb-backups` / `pickertime-pb-backups-to-gcs` (retensi pesan 7 hari, ack deadline 120 s) |
| Salinan lokal | 5 zip terakhir di `pb_data/backups/` |
| State terakhir | `/opt/pickertime/backup-state.env`, `/opt/pickertime-backups/relay-state.env` |

Yang diverifikasi nyata (bukan asumsi): zip hasil restore dibuka di container
PocketBase throwaway (`127.0.0.1:8091`, tidak di network aplikasi) oleh
`tools/backup/pb-restore-verify.sh` dan hasilnya `MARKER_health API is healthy.`,
`MARKER_auth OK`, daftar koleksi `Focus_Sessions Profiles Tasks Workspace_Events`
muncul, lalu instansinya dihapus. md5 objek di bucket sama dengan md5 yang ditulis
script backup (`yM5YT3jnNMIug86ME5kPSw==` untuk `pb_backup_acme_20261002093226.zip`).

Relay hanya meng-ack pesan setelah objek terverifikasi crc32c di bucket, jadi kegagalan
upload dicoba ulang otomatis. Pesan `acknowledge` Pub/Sub memakai field `ackIds` — kalau
salah jadi `acks`, responsnya HTTP 400 dan pesan tidak pernah hilang dari antrean.

Cek cepat:
```bash
sudo systemctl start pickertime-pb-backup.service && sudo cat /opt/pickertime/backup-state.env   # di hermes
sudo /opt/pickertime-backups/pickertime-pb-relay.sh                                              # di watchdog
gcloud storage ls 'gs://pickertime-pb-backups/**/*.zip'                                          # dari laptop
```

## 7. Historis
Backend lama diproyeksikan ke `api.elarisnoir.my.id` dan mati (523) karena VM
aslinya sudah tidak ada; `pb_data` lama tidak terselamatkan, jadi instance ini
dibangun dari nol dengan skema hasil `pocketbase migrate collections`.
