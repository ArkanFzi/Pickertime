# Skema PocketBase Pickertime (sudah dikodifikasi)

Skema TIDAK dibuat manual lewat Dashboard lagi. Sumber kebenaran adalah
`pb_migrations/1790909763_collections_snapshot.js`; server PocketBase menerapkannya
otomatis saat boot (`automigrate` aktif secara default).

## Menjalankan backend lokal

```bash
docker run -d --name pickertime-pb -p 127.0.0.1:8090:8090 \
  -e PB_ADMIN_EMAIL=<email-admin> \
  -e PB_ADMIN_PASSWORD=<password-admin> \
  -e GEMINI_API_KEY=<key, opsional> \
  -v $PWD/pb_data:/pb_data \
  -v $PWD/pb_hooks:/pb_hooks \
  -v $PWD/pb_migrations:/pb_migrations \
  ghcr.io/muchobien/pocketbase:0.40.4
```

`PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` dibaca oleh entrypoint image dan membuat
superuser lewat `pocketbase superuser upsert --dir=/pb_data`. Kalau CLI dijalankan
manual di container yang sedang jalan, **selalu** sertakan `--dir=/pb_data`; tanpa itu
CLI menulis ke `/usr/local/bin/pb_data` dan server tidak pernah melihatnya.

## Versi

| Komponen | Versi | Status |
|---|---|---|
| Server | `ghcr.io/muchobien/pocketbase:0.40.4` (image build dari PocketBase v0.26.6 untuk tag `0.26`) | teruji |
| SDK aplikasi | `pocketbase@0.26.9` | teruji lawan server 0.26.6 dan 0.40.4, hasil identik |

Tidak ada rilis server v0.26.9 (0.26.x = v0.26.1–v0.26.6).

## Koleksi

### 1. `Profiles` (auth)
| Field | Tipe | Catatan |
|---|---|---|
| `full_name` | text | required, max 255 |
| `role` | select (1) | Student, Professional, Researcher, Creator, Freelancer |
| `focus_goal` | text | max 500 |
| `energy_pref` | select (1) | Morning, Afternoon, Night Owl |
| `avatar_url` | file (1) | png/jpeg/webp, max 5 MiB |
| `created`, `updated` | autodate | wajib ada, lihat catatan di bawah |

API Rules: `list`/`view`/`update`/`delete` = `@request.auth.id != "" && id = @request.auth.id`,
`create` = `""` (string kosong = registrasi publik). Nilai `null` berarti hanya superuser yang
boleh membuat record, dan sign-up dari aplikasi akan gagal.

### 2. `Tasks` (base)
`user` (relation → Profiles, cascade), `title` (text required), `description` (text),
`category` (select: Work/Study/Health/Personal/Other), `priority` (select: High/Medium/Low),
`start_time` (date), `end_time` (date), `duration_minutes` (number 0–1440),
`is_completed` (bool), `has_alarm` (bool), `alarm_minutes_before` (number 0–1440),
`created`, `updated` (autodate).

### 3. `Focus_Sessions` (base)
`user` (relation → Profiles), `task` (relation → Tasks, tanpa cascade),
`duration_seconds` (number ≥ 0), `completed` (bool), `created`, `updated`.

### 4. `Workspace_Events` (base) — jembatan OpenClaw
`user` (relation → Profiles), `event_type` (text required: START_FOCUS, STOP_FOCUS,
PAUSE_FOCUS, RESET_FOCUS, SESSION_COMPLETE), `payload` (json), `is_processed` (bool),
`created`, `updated`.

API Rules untuk tiga koleksi base: `list`/`view`/`update`/`delete` =
`@request.auth.id != "" && user = @request.auth.id`, `create` = `@request.auth.id != ""`.
Aturan ini sudah diverifikasi: user lain mendapat 0 record dan tidak bisa membaca profil
user lain.

## Tiga jebakan yang sudah ditemukan (jangan diulang)

1. **`created`/`updated` tidak otomatis dibuat saat koleksi dibuat lewat API.** Kalau
   field `autodate` tidak disertakan di `fields`, filter `created >= "..."` pada koleksi itu
   balikan HTTP 400 "Something went wrong while processing your request." — ini yang terjadi
   pada query di `app/(tabs)/insights.tsx`. Setiap koleksi baru wajib menyertakan
   `{type:"autodate", name:"created", onCreate:true, onUpdate:false}` dan
   `{type:"autodate", name:"updated", onCreate:true, onUpdate:true}`.
2. **Tipe field tanggal adalah `date`, bukan `datetime`.** `datetime` ditolak
   ("Failed to load the submitted data due to invalid formatting") di 0.26.6 maupun 0.40.4.
   Tipe `date` menyimpan presisi milidetik: kirim `2026-10-02T02:57:12.158Z`,
   back `2026-10-02 02:57:12.158Z`.
3. **`@request.ip` bukan aturan yang valid**; ekspresi selalu-benar untuk registrasi publik
   adalah string kosong `""`.
4. **Batas waktu di filter dikirim sebagai detik UTC (epoch) atau `"YYYY-MM-DD HH:MM:SS"` —
   jangan `toISOString()`.** Kolom tanggal disimpan sebagai teks `YYYY-MM-DD HH:MM:SS.mmmZ`,
   dan literal ber-huruf "T" dibandingkan PocketBase sebagai teks, bukan instans (terukur pada
   satu baris `2026-10-08 22:00:00.000Z` dengan tiga ejaan batas untuk instans yang sama:
   `"2026-10-08T17:00:00.000Z"` -> **0 baris**, `"2026-10-08 17:00:00.000Z"` -> **1**,
   `1791478800` -> **1**; `' ' < 'T'` menjelaskan arah kesalahannya). Tanpa kutip pun epoch
   diterima. Ini pernah senyap merusak statistik mingguan `app/(tabs)/insights.tsx`, yang
   memotong minggu dengan `monday.toISOString()` sehingga setiap baris pada tanggal UTC yang
   sama dengan batas hilang dari hitungan (F-79; nomornya F-75 dulu, diubah karena F-75/F-76/F-78
   sudah dipakai register `openclaw-docker`). Guard: `tools/test/findings.mjs` memindai
   pola `>= "${…toISOString()}"` di `app/ store/ lib/` dan menuntut nol.

## Menambah/mengubah koleksi

Ubah lewat Dashboard ATAU API pada server yang menjalankan repo ini, lalu ekspor snapshot:

```bash
echo y | docker exec -i pickertime-pb /usr/local/bin/pocketbase migrate collections \
  --dir=/pb_data --migrationsDir=/pb_migrations
```

Salin file hasilnya ke `pb_migrations/` di repo dan commit. Jangan menaruh
`pb_data/` (SQLite + upload) ke dalam repo.

## Verifikasi

```bash
PB_SU_EMAIL=<email-admin> PB_SU_PASSWORD=<password-admin> \
node tools/pb/pb-schema-verify.mjs http://127.0.0.1:8090 <label>
```

Skrip itu menandatangani user baru, menjalankan seluruh permukaan API yang dipakai
aplikasi (`app/(auth)/*`, `store/useStore.ts`, `app/focus.tsx`, `app/(tabs)/insights.tsx`),
menguji isolasi antar user, dan memeriksa `POST /api/ai/gemini`.
