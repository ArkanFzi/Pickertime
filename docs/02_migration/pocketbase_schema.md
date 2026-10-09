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
`user` (relation → Profiles), `event_type` (text required, `pattern`
`^(START_FOCUS|STOP_FOCUS|PAUSE_FOCUS|RESET_FOCUS|SESSION_COMPLETE|UNKNOWN)$`),
`payload` (json), `occurred_at` (date, TIDAK wajib), `is_processed` (bool),
`created`, `updated`. Indeks `idx_events_user_occurred` pada `(user, occurred_at)`.

Bunyi di atas adalah hasil migrasi `1791526402_workspace_events_ketat.js` (T-21, 2026-10-09).
Tiga hal yang perlu diketahui sebelum menambah jenis event:

- `UNKNOWN` bukan jenis event aplikasi. Ia nilai penanda untuk baris lama yang `event_type`-nya
  di luar daftar saat migrasi itu jalan; `app/focus.tsx` tidak pernah menulisnya, tapi skema
  mengizinkannya — itu harga supaya baris warisan tetap bisa ditulis (lihat jebakan 4).
  Gerbang statis `npm run test:enum` membandingkan union TS dengan `EVENTS` di migrasi, jadi
  menambah jenis event tanpa migrasi (atau sebaliknya) membuat CI merah.
- `occurred_at` dibuat tidak wajib karena build aplikasi yang sudah terpasang di perangkat belum
  mengirimnya; memaksanya = semua penulisan event balikan 400 sampai aplikasi di-update.
  Baris lama diisi dari `payload.timestamp`, dan kalau payload tidak punya timestamp dipakai
  `created` (dugaan, bukan fakta — dicetak di log migrasi sebagai `fallbackCreated=`).
- Yang dibaca loop belajar adalah `occurred_at`, bukan `payload.timestamp`: filter per hari di
  atas JSON tidak bisa dibuat dan tidak punya indeks.

API Rules untuk tiga koleksi base: `list`/`view`/`update`/`delete` =
`@request.auth.id != "" && user = @request.auth.id`, `create` =
`@request.auth.id != "" && user = @request.auth.id` (diikat oleh migrasi
`1790909800_ownership_create_rule.js` sesudah temuan F-03; teks lama menyebut `create` hanya
`@request.auth.id != ""` — itu kondisi yang memperbolehkan user menulis atas nama user lain).
Aturan ini sudah diverifikasi: user lain mendapat 0 record dan tidak bisa membaca profil
user lain.

## Permukaan auth `Profiles` — fakta terukur (2026-10-09, PocketBase 0.40.4)

Diukur terhadap backend uji lokal lewat `tools/test/findings.mjs` (blok F-37/F-38) dan probe buangan
yang sudah dihapus. Ini bagian yang paling sering ditebak dari dokumentasi dan paling mahal kalau salah,
jadi setiap baris di bawah punya bentuk respons aslinya.

| Permintaan | Hasil terukur | Konsekuensi untuk aplikasi |
|---|---|---|
| `POST /api/collections/Profiles/records` (email baru) | HTTP 201, `verified: false` | Signup bisa langsung dipakai: `requireVerified` mati. |
| create dengan **email sudah dipakai** | HTTP 400 `Failed to create record.`, `data.data.email.code = "validation_not_unique"` (`"Value must be unique."`) | Satu-satunya penanda yang boleh dipakai untuk menawarkan "lanjutkan login". **Bukan** `validation_record_exists` — itu tebakan audit lama dan tidak pernah dikirim server. |
| `authWithPassword` email **tidak ada** | HTTP 400 `Failed to authenticate.`, `data = {}` | — |
| `authWithPassword` email ada, **password salah** | HTTP 400 `Failed to authenticate.`, `data = {}` | Kedua body **identik**, jadi pesan login tidak boleh menyalah satu bidang (`lib/authContract.ts :: describeSignInFailure`). |
| `POST /api/collections/Profiles/requests-password-reset` | HTTP 200, isi `true` — **sama saja** untuk email terdaftar maupun tidak; `smtp.enabled=false` dan **0** baris log mailer | `true` hanya berarti permintaan diterima. Jangan pernah menulis "cek email Anda" sebagai janji (`passwordResetCopy`). |
| hapus record milik sendiri (`delete(ownId)` dengan token user) | berhasil | Probe gate boleh bersih-bersih tanpa kredensial superuser. |
| `Profiles.authToken.duration` | `432000` (5 hari), dan aplikasi **tidak** memanggil `authRefresh` | Sesi pasti putus; `lib/session.ts` menandai `expired` vs `logout` supaya tidak terasa seperti aplikasi hangus. |

Dua jebakan yang bukan bentuk data:

1. **Kunci settings mailer adalah `smtp`, bukan `mailer`.** Membaca `settings.mailer.enabled`
   menghasilkan `undefined` — terlihat seperti "mailer aktif" padahal tidak ada objeknya.
2. **`authStore.onChange` dipanggil segera saat dilangganan**, dengan store kosong kalau aplikasi
   baru dibuka. Listener yang menyimpulkan "sesi berakhir" dari `model == null` akan berteriak
   setiap cold start; butuh penjaga "pernah terautentikasi" (`lib/session.ts :: wasAuthenticated`).

Aturan API yang menegakkannya: `create`/`list`/`view`/`update`/`delete` pada tiga koleksi terikat
`@request.auth.id != "" && user = @request.auth.id` (F-03). Signup tetap bisa jalan tanpa token
karena `Profiles.create` memakai endpoint koleksi, bukan endpoint auth.

## Proxy AI (`pb_hooks/ai_proxy.pb.js`) — kontrak, bukan vendor

Route-nya **`POST /api/ai/complete`**. Nama itu sengaja menyebut pekerjaan, bukan penyedia:
pindah provider cukup mengganti blok upstream di dalam handler, kontrak di bawah ini tetap.
`GEMINI_API_KEY` hanya hidup di lingkungan server PocketBase dan tidak pernah masuk bundel.

Permintaan (harus token user; anonim = 401):

```json
{ "prompt": "…", "json": true }
```

`prompt` string ≤ 4000 karakter; `json` boolean sejati (type-check eksplisit — string `"true"`
ditolak 400 dan tidak diteruskan ke upstream) dan hanya menyebabkan hook meminta
`responseMimeType: "application/json"`.

Respons sukses **200** selalu `text` + penanda terpotong, tanpa bentuk JSON vendor:

```json
{ "text": "…", "truncated": false }
```

`truncated` = `true` ketika upstream menutup kandidat dengan `finishReason: "MAX_TOKENS"` —
jawaban setengah tidak lagi disebarkan sebagai jawaban utuh.

Kesalahan selalu membawa `code` yang bisa dibaca mesin + `message` untuk manusia; detail mentah
vendor hanya masuk log server (`$app.logger`), tidak pernah ke klien:

| HTTP | `code` | Kapan |
|---|---|---|
| 400 | `blocked` | `promptFeedback` memblokir prompt |
| 400 | — | `prompt` hilang/bukan string, `json` bukan boolean, atau `GEMINI_API_KEY` belum dipasang (`BadRequestError` polos PocketBase) |
| 401 | — | tanpa token (route lama pun tetap 401 untuk anonim) |
| 410 | `moved` | `POST /api/ai/gemini` — jalur lama, build lama diberi tahu secara jujur |
| 413 | `too_long` | `prompt` > 4000 karakter, ditahan **sebelum** memanggil upstream |
| 429 | `rate_limited` | > 10 request/menit per user (jendela tetap; lihat F-81) |
| 502 | `unavailable` | upstream menolak / respons bukan JSON |

Yang tanpa `code` tetap bisa dikenali: `describeAiError` menurunkan kind dari status, dan 400
berpesan `… not configured …` dipetakan ke `not_configured`.
Sisi aplikasi memetakan `code` ini ke `AiFailure` di `lib/aiContract.ts`
(`describeAiError`), jadi membandingkan pesan error tidak pernah diperlukan.

Perubahan perilaku apa pun di file ini **men-deploy**: `deploy.yml` punya path filter
`pb_hooks/**` pada merge ke `main`. Urutan aman = hook terpasang dulu, baru aplikasi memanggil
nama baru; jalur lama sengaja dibiarkan terdaftar supaya gerbang verifikasi di VM
(`tools/deploy/pickertime-pb-agent.sh`, yang menuntut 401 anonim dari salah satu rute) tidak
bail saat build lama masih memakai `/api/ai/gemini`.

## Jebakan yang sudah ditemukan (jangan diulang)

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
4. **Baris yang menabrak `pattern` baru tidak bisa ditulis lagi — selamanya.** Terukur pada
   0.40.4: mengubah skema lewat API saat ada baris `event_type` di luar daftar **diterima**
   (HTTP 200), tapi menulis baris itu setelahnya — bahkan hanya `{"is_processed":true}` —
   ditolak `HTTP 400 {"event_type":{"code":"validation_invalid_format"}}`. Jadi menegakkan
   enum pada koleksi yang sudah berisi data wajib menormalisasi barisnya **lebih dulu**, dan
   kegagalan migrasi itu aman: satu migrasi = satu transaksi, perubahan skema ikut
   di-rollback (terukur: pattern kembali kosong, 3 baris utuh).
5. **Jangan ganti tipe field untuk menegakkan daftar nilai.** Id field = tipe + crc32 nama
   (`text2467634050` → `select2467634050`), dan PocketBase membandingkan field berdasar id:
   ganti tipe = kolom di-DROP lalu dibuat ulang = data baris lama musnah. `pattern` pada tipe
   `text` mengubah opsi tanpa mengubah id.
6. **Di dalam migrasi JSVM, field `json` bukan string dan bukan objek.** `rec.get('payload')`
   muncul sebagai bungkus `[]byte` (terukur: `typeof=object`, `ctor=Array`, keys `0..n` +
   `marshalJSON,scan,string,unmarshalJSON,value`), sehingga `raw.timestamp` = `undefined` dan
   `JSON.parse(raw)` tidak pernah masuk cabang yang benar. Ambil teksnya dengan
   `rec.getString('payload')` (atau `raw.value()`), baru `JSON.parse`.
7. **`migrate` tidak punya flag `--confirm`** dan `migrate down` bertanya interaktif: pakai
   `echo y | docker run -i ...` dan ingat `--dir=/pb_data` (default image menunjuk
   `/usr/local/bin/pb_data`, jadi tanpa itu rollback menjalankan DB yang salah):

   ```bash
   echo y | docker run -i --name pb-rollback --rm \
     -v "$PWD/../pb_data_uji:/pb_data" -v "$PWD/pb_migrations:/pb_migrations:ro" \
     ghcr.io/muchobien/pocketbase:0.40.4 \
     migrate down 1 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks
   ```
8. **Batas waktu di filter dikirim sebagai detik UTC (epoch) atau `"YYYY-MM-DD HH:MM:SS"` —
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
menguji isolasi antar user, dan memeriksa `POST /api/ai/complete` (jalur lama
`POST /api/ai/gemini` diuji tetap 401 untuk anonim dan 410 `code: "moved"` untuk yang login).
