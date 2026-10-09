# Action Plan — hasil audit 2026-10-08

Dokumen ini adalah **rencana tambahan**, bukan pengganti `TODO.md`. Temuan lama proyek
(F-01…F-33) tidak diulang di sini; yang diulang hanya dirujuk dengan ID aslinya supaya
rantai buktinya tetap di `TODO.md`.

ID baru memakai nomor lanjut mulai **F-34**. Sumber: pembacaan kode + `tsc --noEmit`
(exit 0) + `npm run test:enum` (hijau) + `npm run test:batch` (gagal di shell ini, rc=9)
pada branch `dev` sha `faf8870`.

---

## Gelombang 0 — perbaiki gerbang verifikasi dulu (0,5 hari)

Alasan: tanpa ini, semua perbaikan di bawah tidak bisa dibuktikan secara lokal.

| ID | Temuan | Perbaikan |
|---|---|---|
| F-54 | `npm run test:batch` dan `test:findings` mati di mesin kerja: shell memakai Node v18.20.8, `.nvmrc` mengunci 22.23.2, CI memakai 22 → `node: bad option: --disable-warning=…` (rc=9). Gate F-02 hanya pernah hijau di CI. | `nvm use` (aktifkan `.nvmrc`), lalu `npm run test:batch` harus hijau. Tambahkan pemeriksaan versi node di awal skrip supaya gagal dengan pesan jelas, bukan `bad option`. |
| F-55 | Tidak ada ESLint/jest sama sekali; `components/__tests__/StyledText-test.js` adalah test jest yatim (`react-test-renderer` terpasang, jest tidak, tidak ada script). | Putuskan: pasang jest + `npm test`, **atau** hapus file yatim itu. Jangan biarkan test yang tidak pernah berjalan terlihat seperti cakupan. |
| F-58 | `test:ai-proxy` butuh container PB uji (`127.0.0.1:8099`) yang tidak selalu jalan, dan gagal dengan `ECONNREFUSED` tanpa pesan "nyalakan dulu". | Skrip harus mendeteksi backend uji mati dan bilang apa yang harus dijalankan (`docker run … pt-pb-test`), bukan melempar stack. |
| F-59 | Exit code test tertutup pipe `| tail`, jadi kegagalan tak kelihatan di log manual. | Konvensi: `set -o pipefail` saat menjalankan suite dari shell. |

**Bukti gelombang 0 selesai:** `npm run test:batch`, `test:enum`, `test:findings` hijau di mesin kerja, bukan hanya di CI.

---

## Gelombang 1 — alarm benar-benar berbunyi (prioritas produk tertinggi)

Ini jalur nilai inti: user pasang alarm pagi, alarm harus ada.

| ID | Temuan | Lokasi | Perbaikan |
|---|---|---|---|
| **F-34** | "Hari ini" dihitung dalam **UTC**, aplikasi dipakai di WIB (UTC+7). Task 05:00–06:59 WIB tersimpan sebagai hari UTC sebelumnya → **lenyap dari Today's Plan / Timeline / Smart Alarm mulai 07:00 WIB**. | `store/useStore.ts:323` (`toISOString().split('T')[0]`) | Ganti ke batas hari lokal: bandingkan dengan `new Date()` yang dinegatifkan offset perangkat, atau simpan `date_key` (YYYY-MM-DD lokal) sebagai field terpisah dan filter pada field itu. Uji wajib: set perangkat ke Asia/Jakarta, buat task 06:00, reload setelah jam 07:00. |
| **F-33** | *(sudah tercatat, belum diperbaiki)* AutoPlan bulatkan start ke perempat jam (`timeline.tsx:166`) + lead dipaksa 10 menit (`useStore.ts:50-51`) → `triggerDate <= now` → `null` (`notifications.ts:78`). Task tercipta dengan `has_alarm:true` tapi alarm tidak terpasang. | `app/(tabs)/timeline.tsx:166`, `store/useStore.ts:50-51` | Satu keputusan desain: (a) lead dinamis `min(10, jarak_ke_start - 1)`, (b) pembulatan AutoPlan minimal 15 menit ke depan, atau (c) tawarkan user memilih lead. Rekomendasi (a)+(b) sekaligus. |
| **F-35** | Task **tanpa** `start_time` (boleh: `required:false`) tidak pernah lolos filter `start_time >= "…"` → tidak muncul di mana pun, tanpa pesan. | `store/useStore.ts:325`, snapshot `:958` | Tambah cabang `(start_time = "" \|\| start_time >= "<hari>")` atau layar terpisah "Unscheduled". |
| **F-39** | Izin notifikasi hanya bisa diminta sekali, di onboarding. User yang menolak tidak punya jalur memulihkan dari dalam app. | `app/(auth)/permissions.tsx:54` (satu-satunya pemanggil `requestNotificationPermissions`) | Tambah layar/CTA "Izinkan alarm" di chip timeline saat `!alarmArmed`, panggil `Linking.openSettings()` untuk Android 12+, dan minta ulang izin saat penjadwalan gagal karena izin. |
| **F-48** | `alarm_minutes_before \|\| 10` → nilai 0 yang sah ("tepat waktu") berubah jadi 10 menit. | `lib/notifications.ts:75` | `?? 10` dan validasi rentang 0–1440 (sesuai batas skema). |
| **F-43** | Hasil `scheduleTaskNotification` berupa `null` untuk 4 sebab berbeda (tanpa izin / waktu lewat / modul tak ada / exception) dan tidak pernah dibaca store → UI hanya bisa menebak. | `store/useStore.ts:174-181`, `lib/notifications.ts:62-111` | Kembalikan `{ ok, reason }` alih-alih `string \| null`; tampilkan alasan yang benar di chip. |
| — | Suite alarm **A-2…A-7** dan **F-16** masih menunggu perangkat (lihat `TODO.md:852-871,1047-1054`). | — | Jalankan setelah F-34/F-33/F-39 masuk build uji; catat bukti di `TODO.md` M11.7. |

**Keputusan produk yang memblokir F-32 (tercatat, belum dijawab):** "Smart Alarm" saat ini adalah
notifikasi biasa (`USAGE_NOTIFICATION`, tanpa full-screen intent, `mBypassDnd=false`) — dia tidak
akan membangunkan user yang HP-nya disenyapkan. Kalau janji produknya "membangunkan",
ini pindah ke `AlarmClockContract` + `SCHEDULE_EXACT_ALARM` + `USE_FULL_SCREEN_INTENT`,
yang berarti modul Expo custom / config plugin sendiri. Itu bukan perbaikan kecil.

---

## Gelombang 2 — akun tidak bisa tersesat

| ID | Temuan | Lokasi | Perbaikan |
|---|---|---|---|
| **F-37** | Sign-up dua langkah non-atomik: `Profiles.create` lalu `authWithPassword`. Kalau langkah 2 gagal, akun sudah tercipta tapi user belum login; retry ditolak duplikat email; tidak ada rollback dan tidak ada hook server. | `app/(auth)/sign-up.tsx:47,57` | Langsung `authWithPassword` setelah create gagal dengan "email sudah terdaftar" → tawarkan "lanjutkan login" (bukan dead-end). Alternatif lebih bersih: hook `onRecordCreate` di `pb_hooks/` + satu langkah, atau deteksi `error.data.email.code === validation_record_exists`. |
| **F-38** | Jalur pemulihan akun mati: (1) error `requestPasswordReset` **selalu** ditelan → UI selalu "cek email"; (2) `requestVerification`/konfirmasi email tidak ada di repo, field `verified` tak pernah dibaca; (3) link PB `/_/#/auth/confirm-*` menunjuk dashboard yang diblokir 404 di edge. | `app/(auth)/sign-in.tsx:55-61`, snapshot `:842,849`, `docs/01_architecture/backend.md:32-35` | Bedakan sukses SMTP vs kegagalan (jangan `setForgotSent(true)` di `catch`); sedot token reset ke deep link `pickertime://reset-password?token=…` dan buat layarnya; putuskan verifikasi email: aktifkan + layari, atau matikan `verifiedPrefix`/`requireVerified` supaya tidak menggantung. |
| **F-56** | `authToken.duration = 432000` (5 hari) dan tidak ada `authRefresh` di app → sesi mati, SDK clear pada 401, user logout diam-diam tanpa pesan. | snapshot `:606`, `lib/pocketbase.ts` | Tangani 401 eksplisit: tampilkan "sesi berakhir, login lagi" (bukan redirect bisu), dan/atau perpanjang `duration` + refresh terjadwal saat app dibuka. |
| **F-51** | Tidak ada layar edit profil. `full_name` tidak bisa diubah; `focus_goal`/`energy_pref` bisa kosong selamanya (Skip `context-setup.tsx:76`, kegagalan tulis hanya `console.error` `:46-48`) → AutoPlan mengirim string kosong ke prompt AI (`timeline.tsx:155`). | `app/(tabs)/profile.tsx` | Tambah form edit profil + validasi; tolak AutoPlan dengan pesan jelas kalau `focus_goal`/`energy_pref` kosong. |

---

## Gelombang 3 — keandalan jalur AI (bebas dari keputusan provider)

Pekerjaan di gelombang ini **tidak bergantung** pada model apa pun; lakukan sekarang agar
pindah provider tinggal ganti config.

| ID | Temuan | Lokasi | Perbaikan |
|---|---|---|---|
| **F-42** | (a) hanya `parts[0]` yang dibaca → JSON yang dipecah Gemini ke beberapa `parts` terpotong dan parse gagal senyap; (b) tidak ada `responseMimeType: "application/json"` → parsing pakai regex buta dan **dua fungsi parse dengan dua cara berbeda**; (c) `finishReason` dan `promptFeedback.blocked` tidak pernah diperiksa. | `lib/gemini.ts:43,70,112,140`; `pb_hooks/ai_proxy.pb.js:80-85,96-106` | Gabung semua `parts` jadi satu string; minta output JSON dari API; ganti regex dengan satu parser yang dipakai keempat fungsi; baca `finishReason` dan log ke server saat terpotong/blocked. |
| **F-44** | `topK: 1` = greedy decoding, membuat `temperature: 0.7` dan `topP: 1` jadi config mati. | `pb_hooks/ai_proxy.pb.js:80-85` | `topK` ke nilai wajar (20–40) atau hapus; jangan tinggalkan knob yang tidak berpengaruh — membingungkan saat tuning. |
| **F-45** | Pesan rate-limit/413 dari server dibuang: `callGemini` melempar string generik lalu semua pemanggil merapatkan jadi `null`. User tidak pernah tahu dia kena batas 10/menit. | `lib/gemini.ts:32-48,46` | Pertahankan status + pesan server; tampilkan "tunggu sebentar" dan tombol coba lagi. |
| **F-46** | Tidak ada cache/dedup: Insights dan Smart Alarm sama-sama panggil `getAIInsight` tiap mount → jatah 10/menit habis untuk satu user yang bolak-balik tab. | `app/(tabs)/insights.tsx:156`, `app/smart-alarm.tsx:111` | Cache insight per hari (AsyncStorage) + request in-flight guard. |
| **F-47** | Input dibatasi 4000 karakter tapi **output tidak**: `title`/`desc` hasil AI langsung jadi task nyata; dan data user disisipkan mentah ke prompt tanpa delimiter (permukaan prompt-injection). | `lib/gemini.ts:60-67,132-137`, `app/(tabs)/timeline.tsx:172-181` | Batasi panjang + potong di UI; bungkus data user dalam delimiter yang jelas dan nyatakan bahwa itu data, bukan instruksi. |
| **F-60** | `callGemini` memakai nama endpoint/model `/api/ai/gemini` di dua sisi. | `ai_proxy.pb.js:30`, `gemini.ts:35` | Ganti ke `/api/ai/complete` (satu migrasi kecil, membuka jalan ganti provider tanpa berbohong lewat nama). |

---

## Gelombang 4 — bersih-bersih kebenaran state & skema

| ID | Temuan | Lokasi | Perbaikan |
|---|---|---|---|
| **F-49** | Klaim realtime palsu: EventSource dipolyfill "untuk Realtime Subscriptions", komentar store menyebut realtime, dependensi `react-native-sse` terpasang — `grep '.subscribe('` di seluruh app/lib/store/components = **0**. Multi-perangkat selalu basi sampai refetch. | `lib/pocketbase.ts:4-9`, `store/useStore.ts:61`, `package.json:47` | Pilih: pasang `Tasks`/`Focus_Sessions` subscribe per user (sekitar 20 baris, manfaat nyata), **atau** hapus polyfill + komentar + dependensi. Jangan tinggalkan komentar yang menjelaskan fitur yang tidak ada. |
| **F-50** | `syncUpdateTask` menyimpan payload klien ke state dan **membuang** respons server (`updatedTask` hanya di-return) → dua format tanggal beredar (server membalas `"2026-10-07 13:55:00.000Z"`, lihat `tools/test/tmp/seed.json`). | `store/useStore.ts:229-234` | `set` dari `updatedTask`, bukan `updates` — sama seperti jalur create. |
| **F-52** | `Focus_Sessions.task` `cascadeDelete:false`: hapus task yang sudah punya sesi tidak dijamin bersih; `syncDeleteTask` tidak mengurus sesi terkait dan jalur ini tidak pernah diuji. | snapshot `:1088`, `store/useStore.ts:306` | Putuskan semantik (riwayatkan sesi jadi yatim, atau tolak hapus task bersesi), lalu tambahkan uji. |
| **F-57** | Snapshot tidak pernah di-resnap setelah `1790909800_ownership_create_rule.js` → server yang mengimpor ulang `1790909763` tanpa migrasi #2 **kembali bolong** (createRule `@request.auth.id != ""` saja). | `pb_migrations/1790909763_collections_snapshot.js:858,1055,1155` | Resnap snapshot dengan aturan kepemilikan sudah di dalam, atau gabungkan migrasi #2 ke snapshot. Tambah uji CI: "snapshot saja, tanpa migrasi #2, harus tetap menolak create lintas user". |
| **F-61** | Dead surface: tombol "Apple"/Google tanpa handler (OAuth2 dimatikan di skema), `avatar_url` tak pernah dibaca/di-upload (`protected:false`), `onboardingComplete` tak dibaca siapa pun, `expo-calendar` di dependencies tapi tak dipakai → manifest tetap mendeklarasikan READ/WRITE_CALENDAR (F-06/F-27), `Focus_Sessions.completed` + `Workspace_Events.is_processed/payload` tak pernah dibaca, `PAUSE_FOCUS`/`RESET_FOCUS` hanya ada di tipe. | `app/(auth)/sign-up.tsx:209-218`, `store/useStore.ts:141,351`, `package.json:28`, `app/focus.tsx:15` | Satu PR "hapus yang tidak berfungsi": cabut `expo-calendar` (lalu build ulang — menutup sisa F-06/F-27), hapus tombol SSO atau implementasikan, hapus state mati, dan putuskan nasib `Workspace_Events` (lihat F-62). |
| **F-63** | `getWeekRange()` salah pada hari Minggu (`now.getDate() - now.getDay() + 1` → Minggu 11 Okt menghasilkan Senin 12 Okt = minggu depan) sementara `loadRealData()` memakai koreksi yang benar → dua rumus minggu dalam satu file, header tidak cocok dengan datanya. | `app/(tabs)/insights.tsx:365` vs `:90` | Satu helper `startOfLocalWeek()` yang dipakai keduanya. |
| **F-64** | Kosakata periode tidak konsisten: heatmap melabeli bucket ketiga "Evening", `energy_pref` skema = "Night Owl" → "Best Time to Focus" tidak pernah bisa dibandingkan dengan preferensi user, padahal nilai itu juga dikirim ke prompt AutoPlan. | `insights.tsx:32,106,119-121`, snapshot `:691-695` | Satu sumber kosakata (konstanta), dan bandingkan eksplisit: "kamu bilang Night Owl, datamu menunjukkan Morning". |
| **F-65** | `snoozeCount` tidak dipersist → kartu "Snooze Rate" mencampur penghitung satu sesi dengan jumlah task seminggu (label sudah jujur, tapi angkanya bukan ukuran apa pun). | `store/useStore.ts:339-340`, `insights.tsx:57-59` | Persist per hari, atau ganti jadi angka absolut "snooze minggu ini". |

---

## Gelombang 5 — dokumen & nama (murah, tapi bikin agen/alat salah)

| ID | Temuan | Lokasi |
|---|---|---|
| **F-66** | Masih menyebut **Appwrite**: `docs/01_architecture/ai_strategy.md:12`, `docs/03_automations/openclaw_bridge.md:7,14`, `docs/PROJECT_ROADMAP.md:43` — padahal `backend.md:6-7` tegas tidak ada Appwrite. Seluruh `openclaw_bridge.md` menulis terhadap Appwrite, jadi desain bridge-nya belum pernah benar-benar dipetakan ke PocketBase. |
| **F-67** | Nama koleksi **lowercase** (`profiles`, `tasks`, `focus_sessions`, `workspace_events`) di `CLAUDE.md:44-53` dan `GEMINI.md:13,50-53`; skema memakai PascalCase → alat/agen yang menuruti dokumen ini kena 404 "Collection not found". |
| **F-68** | `CLAUDE.md:48` mengklaim `start_time (DateTime)` dan daftar `category` tanpa "Other"; bertentangan dengan snapshot (tipe `date`) dan `docs/02`. `docs/02:62-64` menyebut `event_type` enum 5 nilai padahal field-nya text bebas tanpa pattern (snapshot `:1194-1201`); `docs/02:66-67` masih menulis createRule lama; `docs/02:39-44` tidak menyebut `role`/`energy_pref` `required:false` padahal UI memperlakukannya sebagai data inti. |

Perbaikan: satu PR dokumen; tambahkan gate CI kecil yang menolak kata "Appwrite" dan nama
koleksi lowercase di `*.md` ter-track (perpanjang pola `tools/test/enum-contract.mjs`).

---

## Gelombang 6 — keputusan terbuka (butuh jawabanmu, bukan kode)

| ID | Keputusan | Dampak kalau tidak diputuskan |
|---|---|---|
| **F-32** | Notifikasi biasa vs alarm sungguhan (`AlarmClockContract` + `SCHEDULE_EXACT_ALARM` + full-screen intent). | Janji "Smart Alarm" tidak bisa ditepati di layar kunci / mode senyap. |
| **F-62** | `Workspace_Events`: dihapus, jadi data analitik yang dibaca, atau jadi antrean kerja untuk agen desktop? | Tabel ini menulis selamanya tanpa pembaca; biaya storage tanpa manfaat. |
| **F-69** | Provider AI: tetap Gemini, pindah ke gateway lain, atau dua-duanya di belakang satu router. | Semua perbaikan F-42/F-45/F-46 tetap terikat satu vendor dengan alias rolling. |
| **F-70** | Appwrite→PocketBase: apakah `openclaw_bridge.md` masih visi yang mau dikejar, atau arsip? | Dokumen menyesatkan tetap jadi dasar keputusan lintas-repo. |
| — | Sisa `TODO.md`: M4.4 (secret `EAS_TOKEN`), M4.5 (service key Play Console), M5.4 (hapus PAT via UI), M5.8 (latihan restore GCS), P7, P8 (target 2026-10-12), hutang proses H1–H9. | Semuanya BLOCKED di luar kode — butuh kamu, bukan agen. |

---

## Gelombang 3.5 — keputusan provider AI (**terikat tanggal**)

Mendesak karena `pb_hooks/ai_proxy.pb.js:76` memakai **alias rolling** `gemini-flash-lite-latest`:

- Google menjadwalkan **pemadaman jalur 2.5 pada 20 Oktober 2026** — 12 hari dari sekarang
  (`gemini-2.5-pro` → shutdown 2026-10-20; halaman model 2.5 Flash-Lite menyatakan "being retired
  on October 20th, 2026"). Kalau alias saat ini resolve ke jalur 2.5, perilakunya berubah/putus
  pada tanggal itu tanpa satu pun commit dari kita.
- Preseden kegagalan alias sudah tercatat di ekosistem: `gemini-flash-latest` dulu resolve ke
  `gemini-2.0-flash`, lalu 2.0 di-deprecated → konsumen yang pakai alias rusak
  (google/adk-python#6010). Ini persis skenario yang dikomentari `ai_proxy.pb.js:73-75`.
- Dok Google kini menyarankan model baru: **3.5 Flash-Lite / 3.8 Flash**; jalur 3.x diberi
  jaminan ≥12 bulan (`gemini-3.1-flash-lite` → 2027-05-07 atau lebih lama).

| ID | Pekerjaan | Catatan |
|---|---|---|
| **F-69** | Putuskan provider. Selama undecided, **kunci versi** (`gemini-3.1-flash-lite` atau `gemini-3.5-flash-lite`, bukan `-latest`) dan **kurasikan model**: `temperature 0.4`, `topK` dilepas dari 1, `maxOutputTokens` per-fungsi. | Satu baris di hook. Tidak memaksakan keputusan vendor, hanya mematikan risiko tanggal 20 Okt. |
| **F-71** | Ukur apa isi alias sekarang sebelum menggantinya: `GET /v1beta/models/gemini-flash-lite-latest` dengan key produksi, catat `baseModelVersion`/`inputTokenLimit` di `TODO.md`. Jangan pindah buta. | Alat: pola yang sama dengan `tools/test/ai-proxy.mjs` (prose 5/5 yang sudah dipakai untuk memilih alias ini). |
| **F-72** | **Tidak ada pagar anggaran harian.** Limit free tier Gemini berlaku **per project, bukan per key** (± 15 RPM / 1.000 RPD untuk 3.1 Flash-Lite), dan RPD reset tengah malam waktu Pasifik. Rate limit 10/menit kita (`ai_proxy.pb.js:32`) melindungi RPM tapi **bukan** RPD → satu hari ramai bisa menghabiskan kuota project dan mematikan AI untuk semua user, dan `RESOURCE_EXHAUSTED` dibalas 502 generik (`:98`) sehingga tidak bisa dibedakan dari mati. | Counter harian per project di `$app.store()` + status 429/503 khusus "kuota harian habis" + catat `usageMetadata.totalTokenCount` ke log server. |
| **F-73** | Router provider di sisi server (`AI_PROVIDER` + fallback chain), endpoint `/api/ai/complete`, dan **satu probe perbandingan** yang menjalankan keempat prompt nyata ke tiap kandidat lalu memvalidasi JSON-nya. Pasang ini sebelum menambah vendor apa pun supaya menambah vendor = menambah satu baris config, bukan menyalin hook. | Kandidat & alasan: lihat ringkasan di jawaban sesi ini; Groq/OpenRouter keduanya OpenAI-compatible REST → bisa dipanggil dari JSVM tanpa SDK. |
| **F-74** | Kalau mau menghilangkan secret dari disk: jalur **Vertex AI via metadata server GCE** — hook minta access token SA ke `metadata.google.internal`, jadi tidak ada API key di `--env-file` sama sekali. Menghindari seluruh jebakan invarian kredensial M8.1 (`AGENTS.md`). | Butuh `roles/aiplatform.user` pada SA VM + cache token di store (TTL ~50 menit). Biaya: +1 hop, format request beda (`:generateContent` per model di `aiplatform.googleapis.com`). |

---

## Urutan yang saya sarankan

1. **Gelombang 0** (0,5 hari) — tanpa ini tidak ada yang bisa dibuktikan lokal.
2. **F-34 + F-35 + F-48 + F-43** (1 hari) — bug kalender murni, dampak terbesar per baris kode.
3. **F-33 + F-39** — butuh satu keputusan desain kecil, lalu suite A-2…A-7 dijalankan di perangkat.
4. **F-42 → F-44 → F-45 → F-46 → F-47 → F-60** — pengerasan jalur AI; **selesaikan sebelum** memutuskan/ganti provider, supaya perpindahan provider tinggal ganti config.
5. **Gelombang 2** (F-37, F-38) — sebelum ada user nyata.
6. **Gelombang 4–5** — pembersihan bertahap, satu PR per kelompok supaya bisa di-review.

Konvensi alur: satu branch `fix/<id>` dari `dev` per gelombang, PR → `dev`, lalu `dev` → `main`
(jangan langsung `main`; dan ingat hanya `pb_hooks/**`, `pb_migrations/**`, `tools/deploy/**`,
`deploy.yml` yang memicu deploy — `AGENTS.md` §Git).

Setiap item wajib ditutup dengan **bukti terukur** (bukan klaim dari pembacaan kode) dan
dicatat di `TODO.md` milestone berikutnya, sesuai aturan anti-berulang H1–H9.

---

## Status 2026-10-09 — gelombang "bug kalender" ditutup sebagian

Semua angka di bawah adalah keluaran alat terhadap backend uji PocketBase 0.40.4
(`pt-pb-test`, `127.0.0.1:8099`), bukan pembacaan kode. Gerbangnya `tools/test/findings.mjs`
yang **sudah** jadi langkah CI (`ci.yml:125-130`, job "Skema PocketBase + hook AI"), jadi
perbaikan ini ikut merah di CI kalau regresi.

| ID | Keadaan | Bukti terukur |
|---|---|---|
| **F-34** | **ditutup** — batas "hari ini" dihitung dari kalender perangkat (`lib/localDay.ts:localDayStartEpoch`), dipakai `store/useStore.ts:324`. | Baris yang sama, dua batas: task 05:00 WIB tersimpan `2026-10-08 22:00:00.000Z`; batas UTC `"2026-10-09"` -> **0 baris** (persis gejala kehilangan tugas pagi), batas lokal `1791478800` -> **1 baris**. Hijau juga saat runner dipaksa `TZ=UTC` (= kondisi CI), karena batas dikirim sebagai detik UTC, bukan string. |
| **F-48** | **ditutup** — aturan lead jadi satu fungsi `resolveLeadMinutes` di `lib/taskContract.ts`, dipakai sisi jadwal (`lib/notifications.ts:76`) DAN sisi tulis (`store/useStore.ts:52`). | `resolveLeadMinutes(0/undefined/null/1440) -> 0,10,10,1440`. Batas server ditegakkan terpisah dan terukur: `create alarm_minutes_before=1441` -> HTTP 400 `validation_max_number_constraint`, `-1` -> `validation_min_number_constraint`, `0` -> **tersimpan 0** (sah). Field yang tidak dikirim saat create juga terukur kembali `0`, jadi default 10 hanya boleh hidup di sisi tulis. |
| **F-79** (semula dicatat sebagai F-79) | **baru, ditutup dalam aksi yang sama** — PocketBase membandingkan filter tanggal bergebyar ISO ber-huruf "T" sebagai **teks** terhadap kolom `YYYY-MM-DD HH:MM:SS.mmmZ`. | Satu baris, tiga ejaan batas untuk instans yang sama: `"2026-10-08T17:00:00.000Z"` -> **0 baris**, `"2026-10-08 17:00:00.000Z"` -> **1**, epoch `1791478800` -> **1**. Sebabnya `app/(tabs)/insights.tsx` dulu memakai `monday.toISOString()` untuk dua query mingguan: setiap baris yang tanggal UTC-nya sama dengan tanggal batas **tidak ikut terhitung** — statistik mingguan kurang tanpa pesan apa pun. Guard: `findings.mjs` memindai `app/ store/ lib/` dari pola `>= "${…toISOString()}"` dan menuntut **0** (terukur `0 filter ISO-"T"`), plus kasus negatif disuntik -> `RED F-79   1 filter masih membandingkan tanggal dengan literal ISO ber-"T": app/(tabs)/insights.tsx:130`, `rc=1`, berkas dipulihkan (md5 cocok). Laporan semula mencetak offset karakter (`:3284`) yang tidak bisa ditunjuk, jadi pemindai diubah ke nomor baris. |
| **F-80** (semula dicatat sebagai F-80) | **baru, ditutup** — rumus lama `now.getDate() - now.getDay() + 1` (label rentang minggu) melompat ke Senin **berikutnya** pada hari Minggu; sekarang `localWeekStart()`. | Dibandingkan atas 91 tanggal (1 Sep – 30 Nov 2026): **13 hari beda**, dan itu persis 13 dari 13 hari Minggu pada rentang itu (Sabtu 13/13 cocok). Contoh `Sun Oct 11 2026` -> lama `Mon Oct 12`, baru `Mon Oct 05`; `Mon Oct 12` -> kedua rumus sama. Assert baru: Senin..Minggu 5–11 Okt 2026 semuanya mendarat di `Mon Oct 05 2026`; mutasi kembali ke rumus lama -> `RED F-80`, `rc=1`. Catatan: rumus lama di `loadRealData` (`getDay()===0 ? 6 : getDay()-1`) justru **tidak** menyimpang — 0/31 tanggal Okt 2026 — jadi bug di query itu murni F-79 (pengiriman ISO-"T"), bukan rumus minggu. |
| **F-35** | **belum** — bukan soal filter, tapi soal *permukaan*. Semua konsumen `store.tasks` sudah menjaga `!t.start_time` (terukur di `timeline.tsx:200`, `schedule.tsx:133/145`, `smart-alarm.tsx:60/65`, `edit-task.tsx:136`, `index.tsx:60`), jadi menambahkan `(start_time = "" \|\| …)` ke `syncFetchTasks` hanya memindahkan baris tak-terjadwal dari "tidak ada di server" ke "ada di memori tapi tidak ditampilkan di layar mana pun". Perlu satu keputusan: layar/section "Tanpa jadwal", atau biarkan tersaring. | — |
| **F-43** | **belum** — `scheduleTaskNotification` masih mengembalikan `string \| null` (`lib/notifications.ts:63`) dan satu-satunya call site nyata (`store/useStore.ts:177`) membuang hasilnya. Mengubahnya jadi `{ ok, reason }` berarti menambah state + satu chip yang bisa menjelaskan *mengapa* alarm tidak terpasang; itu perubahan UI yang harus dibuktikan di perangkat (suite A-2…A-7), bukan di node. | — |

Jebakan yang tercatat dari sesi ini (jangan diulang):

1. **`const URL = …` di dalam skrip membayangi global `URL`** — `tools/test/findings.mjs:29`
   dulahnya begitu, dan `new URL('../../lib/x.ts', import.meta.url)` melempar
   `TypeError: URL is not a constructor`. Dinamai ulang ke `BASE`.
2. **Baris probe yang tertinggal dari run yang mati di tengah jalan mengubah hitungan.** Run yang
   crash sebelum blok bersih-bersih meninggalkan 1 baris `F-34 batas hari WIB`, dan assertion
   `baru === 1` jadi merah untuk alasan yang salah. Sekarang tiap judul probe dikosongkan dulu
   (`bersihkanSisa`) dan jumlahnya dilaporkan (`sisa run lama dibersihkan: N`).
3. **Assert "sama" harus membandingkan hal yang sama.** Percobaan pertama membandingkan
   `getTime()` rumus lama vs baru padahal yang satu tengah malam dan yang lain masih 10:00 —
   hasilnya "BEDA" untuk 7/7 hari, termasuk lima hari yang benar-benar cocok. Dibetulkan jadi
   perbandingan tanggal kalender, dan sisanya yang 13 hari (Minggu) itulah temuannya.
