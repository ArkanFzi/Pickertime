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

## Status 2026-10-09 (siang) — gelombang 3: jalur AI diikat ke kontrak, bukan ke vendor

Angka di bawah keluaran alat terhadap **dua** keadaan backend PocketBase 0.40.4 yang sama-sama
memakai `pb_hooks/` repo ini (bind-mount, jadi hook yang diuji = hook yang dikirim):

- `pt-pb-test` `127.0.0.1:8099` — `GEMINI_API_KEY` **sampah** (menyimulasikan upstream mati).
- `pt-pb-real` `127.0.0.1:8098` — `GEMINI_API_KEY` **nyata** (menyimulasikan upstream hidup).

| ID | Keadaan | Bukti terukur |
|---|---|---|
| **F-42** | **ditutup** — (a) semua `parts` digabung di hook (`pb_hooks/ai_proxy.pb.js:141-144`, `.join("")`); (b) `responseMimeType: "application/json"` diminta saat klien kirim `json: true` (`:100-102`) dan regex buta dibuang demi satu parser `parseAiJson` (`lib/aiContract.ts`) yang dipakai keempat fungsi AI; (c) `finishReason` -> `truncated` (`:146-147`) dan `promptFeedback` -> 400 `blocked` (`:130-135`). Bentuk JSON vendor tidak lagi dikenal aplikasi. | `parseAiJson` **8/8 kasus** lulus, termasuk diskriminator `{"a":4} x {"b":5}` (regex greedy lama mengambil keduanya) dan `} {"a":[1,2]}` yang kurung dalamnya ada di dalam string literal. Sisi klien: nol simbol `candidates`/`promptFeedback`/`generativelanguage` di `lib/gemini.ts`, `parseAiJson(` tepat **4x**, keempat fungsi mengembalikan `Promise<AiResult<…>>`. Sisi server dengan key nyata: `POST /api/ai/complete` -> **HTTP 200 dalam 774 ms** bertubuh `{"text":"Hai! Ada yang bisa saya bantu hari ini?","truncated":false}` — tanpa `candidates`. Mutasi `.join("")` -> `.join(" ")` -> `RED F-42 hook tidak menggabung semua parts`. |
| **F-44** | **ditutup** — `topK: 1` -> `topK: 32` (`pb_hooks/ai_proxy.pb.js:97`), `topP` dihapus karena nilainya `1` = tidak mengaktifkan apa pun; `temperature: 0.7` tinggal dan sekarang benar-benar berpengaruh. | Gate membaca file hook: `topK=32`, dalam rentang 20–40, tidak ada `topP:`. Mutasi `topK: 32,` -> `topK: 1,` -> `RED F-44 sampling config proxy masih mati`. |
| **F-45** | **ditutup** — error tidak lagi dirapatkan jadi `null`: proxy mengirim `code` mesin-terbaca (`rate_limited\|too_long\|blocked\|unavailable\|moved`), `describeAiError` memetakannya ke `AiFailure`, dan UI menampilkan copy per kind + tombol coba lagi saat `retryable`. | **7/7 pemetaan** lulus: 429, 413, 410, 502, 429-tanpa-code (jatuh ke status), 400-not-configured, kegagalan jaringan (teks mentah `Network request failed` **tidak** diteruskan), dan pesan server dipertahankan. Delapan kind punya copy non-kosong di `AI_FAILURE_TEXT`. Terukur di kedua backend: key sampah -> **HTTP 502** `{"code":"unavailable","message":"Layanan AI sedang tidak tersedia. Coba lagi beberapa saat."}` dan body **tidak** memuat detail vendor (raw upstream hanya masuk `$app.logger`). |
| **F-46** | **sebagian** — cache harian (`lib/gemini.ts:128-166`, `INSIGHT_CACHE_KEY='ai:insight-cache'` dipotong `localDayStartEpoch`) + guard in-flight (`:129,178-186`, kunci = sidik jari `hari|role|goal|trend`) sudah ada; **bukti lintas-tab masih butuh perangkat**. | Yang bisa dinilai di node: key cache dan `localDayStartEpoch` benar-benar dipakai, peta in-flight dibersihkan di `finally`, dan satu-satunya pemanggil `getAIInsight` (`app/smart-alarm.tsx`, `insights.tsx`) melewati fungsi itu. Yang belum: dua layar membuka tab yang sama dalam jendela 60 detik dan hanya menghabiskan **1** jatah — itu uji perangkat (suite A-2…A-7). |
| **F-47** | **ditutup** — output dibatasi (`capText`, plafon per field di `lib/aiContract.ts`: judul 80, desc 280, langkah 160, insight 320, kategori 32) dan data user dibungkus `wrapData` dengan pernyataan "data, never instructions". | `capText` 4/4 kasus: input **4000 karakter** -> `AAAAAAAAAAAA…` dengan panjang **80 ≤ 80**. Injeksi delimiter: `wrapData('role', "</role>")` -> tag penutup tidak bisa lebih awal (`</role>` dinetralkan). Hitungan pemakaian di `lib/gemini.ts`: `wrapData` **12x**, `capText` **11x** di keempat prompt. Mutasi `capText` jadi no-op -> `RED F-47 capText tidak memotong: 4000 > 80`. |
| **F-60** | **ditutup** — `/api/ai/gemini` -> `/api/ai/complete` (`pb_hooks/ai_proxy.pb.js:38`, `lib/gemini.ts:54`). Jalur lama **tidak dihapus**: ia tetap terdaftar (`:165`) dan menjawab **401 untuk anonim** + **410 `code:"moved"`** untuk yang login. | Dikonsumen oleh **5 file** (klien + 4 perkakas): `tools/test/ai-proxy.mjs`, `tools/pb/pb-schema-verify.mjs`, `tools/pb/pb-prod-smoke.mjs`, `tools/test/findings.mjs` — semuanya menunjuk `/api/ai/complete`. Jalur lama terukur `401 anonim; 410 code=moved bagi yang login`. Gerbang agen di VM (`tools/deploy/pickertime-pb-agent.sh`) probe `/api/ai/complete` dulu dan hanya jatuh ke `/api/ai/gemini` kalau **404**, jadi urutan deploy hook-vs-build tidak memecahkan gerbang. Gate menuntut **2** `routerAdd` di belakang `$apis.requireAuth()`. Mutasi endpoint klien kembali ke `/api/ai/gemini` -> `RED F-60 lib/gemini.ts tidak memanggil /api/ai/complete \| masih memakai jalur lama`. |
| **F-81** | **baru, belum ditutup** — limiter jendela-tetap di hook **balap** karena JSVM tidak punya primitif atomik. | 12 request **sekuensial** dari 1 akun: **10 lolos / 2 ditahan** (aritmetika benar, terukur sama di kedua backend). 12 request **paralel**: **10/2** dalam 140 ms (key sampah) dan **10/2** dalam 1104 ms (key nyata), tapi satu run lain menghasilkan **11/1** — satu permintaan masuk saat `get`+`set` antar-handler berselisih. Sebab terukur lewat probe buangan (route uji sementara, sudah dihapus, verifikasi 404): `$app.store()` hanya punya `get/set/has/remove` + `getAll,getOk,getOrSet,keys,length,removeAll,reset,setFunc,setIfLessThanLimit,unmarshalJSON,values` — **tidak ada `incr`/`add`/`increment`**; dan isi `$apis` hanya `static,requireGuestOnly,requireAuth,requireSuperuserAuth,requireSuperuserOrOwnerAuth,skipSuccessActivityLog,gzip,bodyLimit,recordAuthResponse,enrichRecord,enrichRecords` — **tidak ada helper rateLimit**. Gerbang sekarang menahan dua-duanya: probe sekuensial mengunci aritmetika, probe paralel merah kalau **tidak ada** satu pun yang ditahan. Perbaikan sebenarnya = jendela geser/token bucket di sisi server (atau `getOrSet` + batas), bukan menambah angka di konstanta. |

Alat yang menghasilkan angka di atas, semuanya `rc=0` pada keadaan akhir:

```
node tools/test/findings.mjs            # 13 baris hijau: F-01 02 03 34 48 79 80 42 44 45 46 47 60
node tools/test/ai-proxy.mjs            # vs 8099 dan vs 8098, masing-masing "Jalur proxy AI bersih."
node tools/pb/pb-schema-verify.mjs …    # vs 8098: "DONE … semua pemeriksaan lulus"
node tools/pb/pb-prod-smoke.mjs …       # vs 8098: "SMOKE PASS", AI langsung chars=105 items=2, "rows left from this run :: 0"
node tools/test/enum-contract.mjs       # 7/7 sumber + event_type
node tools/test/task-batch.mjs          # F-02h
npx tsc --noEmit                        # rc=0
```

Bukti anti-vakum gerbang: satu run mutasi serentak (`topK: 1`, `.join(" ")`, `capText` no-op, endpoint klien
lama) menghasilkan **tepat** empat baris merah dengan atribusi yang benar — `F-42`, `F-44`, `F-47`, `F-60` —
sementara `F-45`/`F-46` tetap hijau karena tidak disentuh. Itu menunjukkan tiap temuan dinilai oleh
assertion-nya sendiri, bukan oleh satu gerbang raksasa.

Jebakan baru dari sesi ini:

1. **Satu run perkakas hanya bisa menilai satu keadaan backend.** Probe "502 harus menyebut upstream"
   dan "200 harus berbentuk `{ text, truncated }`" saling mustahil pada instance yang sama; mencetak
   keduanya sebagai hijau akan jadi gerbang vakum. Yang tak bisa dinilai sekarang berbunyi
   `NOTE tidak dinilai: … (butuh backend uji dengan key sampah)` dan tetap dihitung `rc=0`.
2. **Gate statis harus mengevaluasi interpolasi, bukan menolaknya.** `lib/gemini.ts` sekarang menulis
   `Category must be one of: ${TASK_CATEGORIES.join(', ')}` (satu sumber kebenaran), dan
   `enum-contract.mjs` membacanya sebagai nilai haram `${TASK_CATEGORIES` karena regex-nya berhenti di
   titik `.join`. Diperbaiki dengan menyisipkan isi konstanta sebelum mencocokkan — bukan dengan
   mengembalikan daftar literal ke dalam prompt.
3. **Mengubah nama endpoint memecahkan alat lain yang tidak ikut diedit.** `findings.mjs` dulu
   menempatkan pemeriksaan rute di blok F-42, jadi mutasi klien menghasilkan F-42 merah dan **F-60 hijau**
   — temuan yang justru sedang diuji. Pemeriksaan rute/penamaan dipindah ke blok F-60 dan `lib/gemini.ts`
   masuk daftar pemanggil yang wajib menunjuk `/api/ai/complete`.

---

## Status 2026-10-09 (sore) — gelombang 2: permukaan auth & sesi

Semua angka di bawah diukur hidup terhadap `pt-pb-test` `127.0.0.1:8099` (PocketBase 0.40.4,
bind-mount `pb_hooks/` repo ini, tanpa `GEMINI_API_KEY` nyata — tidak relevan untuk auth).
Probe memakai akun sekali pakai yang dihapus sendiri lewat token milik record itu, jadi
`Profiles` tidak menampung sisa.

| ID | Keadaan | Bukti terukur |
|---|---|---|
| **F-37** | **ditutup** — kegagalan `Profiles.create` karena email sudah dipakai tidak lagi jadi jalan buntu: `isEmailAlreadyRegistered` membaca kode server, layar menawarkan "Lanjutkan masuk" dengan password yang tadi diketik, dan kalau login itu gagal arahnya jelas (reset password). Validasi klien (`validateSignUp`) dijalankan **sebelum** request. | **Koreksi tebakan audit**: rencana lama menulis `error.data.email.code === validation_record_exists`; yang benar-benar dikirim server adalah `data.data.email.code = "validation_not_unique"` (`"Value must be unique."`, HTTP 400 `Failed to create record.`). Rantai terukur di gate: create probe -> **201**, create duplikat -> **HTTP 400 `validation_not_unique`**, `authWithPassword` password sama -> **token issued**, self-delete -> **204**, sisa baris probe -> **0**. `validateSignUp` menolak **4/4** bidang kosong (nama/email/password/role) dan lolos untuk form valid. Layar: **4** slot `fieldErrors.*` inline, Alert generik `"Missing Info"` hilang. Mutasi `PB_EMAIL_TAKEN_CODE` -> `"validation_record_exists"` -> `RED F-37 … kode server aktual "validation_not_unique" berbeda dari PB_EMAIL_TAKEN_CODE="validation_record_exists"` — gerbangnya mati kalau kode server berubah, bukan kalau tebakan lama dipakai lagi. |
| **F-38** | **sebagian** — separuh pertama (error ditelan, UI selalu "cek email") ditutup; separuh kedua (**taut reset masuk ke deep link** + nasib `verified`/`requestVerification`) masih **keputusan**, bukan kode. | Terukur: `requestPasswordReset` -> **HTTP 200 `true`** untuk email yang **tidak pernah terdaftar** maupun yang terdaftar, `smtp.enabled=false` (kunci settings-nya `smtp`; probe yang membaca `s.mailer` mencetak `mailer.enabled=undefined`), dan **0** baris log mailer. Artinya `true` bukan bukti apa pun, jadi copy sekarang hanya menjanjikan "diterima server" dan secara eksplisit menyebut syarat mailer. Catch tidak lagi membuka layar sukses: `setForgotFailed(describeResetFailure(error))` + layar kegagalan sendiri dengan tombol coba ulang (**2** state). `describeResetFailure` menghasilkan **2** pesan berbeda untuk status `0` vs `429`. Untuk login, body "email tidak ada" dan "password salah" **identik** (HTTP 400 `Failed to authenticate.`, `data = {}`) — jadi `describeSignInFailure` memakai `Email atau password tidak cocok.` dan tidak menyalah satu bidang. Mutasi catch kembali ke `setForgotSent(true)` -> `RED F-38 masih ada setForgotSent(true) di dalam catch`. Yang belum: `/_/#/auth/confirm-*` tetap menunjuk dashboard yang diblokir 404 di edge, dan `verified` tidak dibaca di mana pun. |
| **F-56** | **ditutup untuk bagian "logout diam-diam"** — `expired` vs `logout` dibedakan di modul murni (`lib/session.ts`), `_layout.tsx` melapor ke sana, `profile.tsx` menandai dulu sebelum `authStore.clear()`, `welcome.tsx` menampilkan banner "sesi berakhir" lalu membersihkan penanda. Perpanjangan `duration`/refresh terjadwal tetap **keputusan**. | `Profiles.authToken.duration = 432000` (5 hari) dan **0** pemanggil `authRefresh` di `app/`, `store/`, `lib/` — itu yang membuat sesi pasti putus, dan gerbangnya merah kalau seseorang menambah `authRefresh` tanpa menilai ulang banner. State machine **12/12** cek lulus, termasuk dua yang menelan biaya satu sesi debugging: SDK memanggil listener `authStore.onChange` **segera** saat dilangganan, jadi fire pertama (store kosong, belum pernah auth) **tidak boleh** dibaca sebagai sesi berakhir — tanpa penjaga `wasAuthenticated`, mutasinya menghasilkan `RED F-56 cold start belum pernah auth: dapat="expired" harus=null` (4 kasus cold start sekaligus). |

Alat pada keadaan akhir, semuanya `rc=0`:

```
npm run test:findings   # 16 baris hijau: F-01 02 03 34 48 79 80 42 44 45 46 47 60 37 38 56
npm run test:enum       # 7/7 sumber + event_type
npm run test:batch      # F-02h
npx tsc --noEmit        # rc=0
bash -n tools/test/*.sh tools/deploy/*.sh   # 10/10 bersih (shellcheck tidak terpasang di host ini)
```

`npm run test:preflight` tetap merah **2** baris, keduanya perangkat (`no devices/emulators found`,
`adb reverse` kosong) — bukan regresi dari pekerjaan ini.

Bukti anti-vakum: tiga mutasi terpisah (kode konstanta F-37, isi catch F-38, penjaga `wasAuthenticated`
F-56) masing-masing membuat **barisnya sendiri** merah dan tidak menyentuh baris lain; pemulihan diverifikasi
`md5sum` terhadap snapshot sebelum mutasi (7 file diperiksa `SAMA`, `findings.mjs` satu-satunya yang berbeda
karena perbaikan checker di bawah).

Jebakan baru dari sesi ini:

1. **Checker statis yang cocok ke banyak blok bisa menilai blok yang salah.** Regex
   `/catch \(error: any\) \{[\s\S]*?\n    \} finally/` untuk layar reset justru menangkap catch
   `handleSignIn` (bentuknya sama), sehingga mutasi F-38 sempat merah hanya karena pemeriksaan
   *lain* (`describeResetFailure(error)` hilang) — bukan karena pemeriksaan yang dimaksud.
   Dippersempit dengan jangkar nama fungsi: `/async function handleForgotPassword\(\)[\s\S]*?catch …/`.
2. **Polaritas assertion bisa terbalik dan gate justru menyalahkan kode yang benar.** Assertion
   "harus hanya true untuk kode email unik" dulu ditulis `if (!isEmailAlreadyRegistered(...))`,
   yang berarti menuntut **true** untuk error field lain. Run pertama berbunyi
   `RED F-37 … tidak cukup spesifik` padahal fungsinya benar. Aturan praktis: baris baru harus
   dilihat **dua** kali — sekali GREEN pada kode benar, sekali RED pada mutasi.
3. **Jangan pakai string literal untuk jumlah yang bisa dihitung.** Baris F-56 sempat mengklaim
   "lulus 14 cek" padahal ada 12. Sekarang `jumlahCek` dan `jumlahTolakan` diturunkan dari
   eksekusi, sama seperti `KASUS.length` di F-45.

---

## Status 2026-10-09 (malam) — gelombang 5: dokumen diikat ke skema

Rencana lama berbunyi "satu PR dokumen; tambahkan gate CI kecil yang menolak kata Appwrite dan
nama koleksi lowercase". Urutannya dibalik: **gerbang dibangun dulu**, supaya daftar merah
dihasilkan perkakas dan bukan oleh saya sambil membaca — dokumen yang diperbaiki tanpa gerbang
bocor lagi (pelajaran F-01/F-03).

`tools/test/docs-contract.mjs` menilai **11** dari **23** berkas markdown ter-track; **12**
dikecualikan lewat `EXCLUDE` yang tiap entrinya punya alasan + ID temuan (audit, arsip,
`docs/03_automations/openclaw_bridge.md` menunggu F-70, `docs/05_agent/`, `.claude/`). Sumber
kebenaran dibaca dari repo: snapshot koleksi `1790909763_collections_snapshot.js`, migrasi
**sesudah** snapshot untuk rule API, `.nvmrc`, dan isi root repo untuk file `*.example`.

| ID | Keadaan | Bukti terukur |
|---|---|---|
| **F-66** | **sebagian** — 2 dari 3 situs ditutup: `docs/01_architecture/ai_strategy.md:12` sekarang menulis "koleksi `Workspace_Events` di PocketBase", `docs/PROJECT_ROADMAP.md:43` menulis "PocketBase + OpenClaw". Situs ketiga (`openclaw_bridge.md`) **sengaja tidak disentuh**: seluruh doknya menulis terhadap Appwrite dan nasibnya adalah keputusan **F-70**, bukan pekerjaan mekanis. | Run pertama: **2** merah. Sekarang **0**. Mutasi "sisipkan satu baris mengandung Appwrite di CLAUDE.md" -> `RED F66 CLAUDE.md:2 menyebut Appwrite`. Kontrol negatif sudah terbukti di keadaan hijau: `AGENTS.md:32`, `README.md:125`, `backend.md:12,41` menyebut `@request.auth.id` sebagai kiasan dan **tidak** ikut merah. |
| **F-67** | **ditutup** — `CLAUDE.md` dan `GEMINI.md` §3 ditulis ulang dengan nama PascalCase persis seperti skema; `docs/PROJECT_ROADMAP.md:39` ikut. | **19** merah pada run pertama (CLAUDE 9, GEMINI 9, ROADMAP 1) — semua bentuk `profiles`/`tasks`/`focus_sessions`/`workspace_events`. Mutasi `Profiles` -> `profiles` di GEMINI.md -> `RED F67 GEMINI.md:44 koleksi \`profiles\` harus \`Profiles\`` (tepat 1 merah). |
| **F-68** | **ditutup untuk dokumen agen** — tipe field, daftar select, nilai rule dan referensi file contoh di `CLAUDE.md`/`GEMINI.md` sekarang sama dengan snapshot; `docs/02_migration/pocketbase_schema.md` §1 ditambah satu paragraf yang menjawab sub-klaim "`role`/`energy_pref` tidak disebut `required:false`" dengan angka dan `file:line` pemakai. | **12** merah (2 `start_time (DateTime)` vs tipe server `date`, 2 select `category` tanpa `Other`, 8 teks rule yang tidak pernah ada di skema). Semua anjuran rule lama (`id = @request.auth.id`, `user = @request.auth.id`) adalah **potongan**, bukan rule yang dikirim server; yang diverifikasi: `@request.auth.id != "" && id = @request.auth.id` (Profiles) dan `@request.auth.id != "" && user = @request.auth.id` (tiga koleksi base). Mutasi per kelas: DateTime -> 1 merah, buang `Other` -> 1 merah (`hilang: Other`), tulis potongan rule di sel header -> 1 merah, rujuk `Caddyfile.tidak.ada.example` -> 1 merah. |
| **F-54** (kelas, bukan F-69) | **ditutup untuk dokumen** — `CLAUDE.md:22`/`GEMINI.md:22` tidak lagi menganjurkan "v18.x atau v20.x LTS"; sekarang 22.23.2 + alasan (`>= 22.18` untuk `import` langsung `.ts`). | **2** merah di run pertama; mutasi mengembalikan "versi v18.x" -> `RED F54 CLAUDE.md:22 menyarankan node v18, .nvmrc mengunci 22.23.2`. ID dicatat di bawah F-54 karena **F-69 di rencana ini adalah keputusan provider AI** — gerbang tidak boleh mencuri ID temuan lain. |

Perkakas pada keadaan akhir, semuanya `rc=0`:

```
npm run typecheck      # tsc --noEmit
npm run test:docs      # 11 dinilai / 12 dikecualikan -> "Semua klaim dokumen cocok"
npm run test:enum      # 7/7 sumber + event_type
npm run test:findings  # 16 baris hijau
npm run test:batch
```

Gerbang didaftarkan sebagai `scripts.test:docs` dan job CI baru **bernama sendiri**,
`Kontrak dokumen terhadap skema`, bukan langkah tambahan di dalam `contract` — alasan: job
`contract` butuh `npm ci` sedangkan gerbang dokumen hanya butuh node + git, dan mencampur keduanya
membuat satu kegagalan menyeret job yang tidak relevan. Nama ini **tidak** dipasang sebagai
required check (required tetap `Type-check` + `Skema PocketBase + hook AI`), dan `.github/workflows/ci.yml`
bukan path pemicu deploy — merge ini tidak men-deploy apa pun.

Batas yang ditulis jujur di kepala gerbang, supaya hijaunya tidak dibaca lebih besar dari
yang ia periksa:

1. Rule API diuji sebagai **himpunan** (snapshot + nilai yang ditugaskan migrasi sesudah
   snapshot), bukan sebagai "rule milik koleksi X". Penyebabnya terukur: snapshot
   `1790909763` dibuat **sebelum** `1790909800_ownership_create_rule.js` (F-03), jadi
   `Tasks.createRule` di snapshot masih `@request.auth.id != ""`. Itu persis F-57; sampai resnap,
   gate tidak boleh mengklaim tahu pemetaan rule-per-koleksi.
2. Field yang baru ada di migrasi (`occurred_at`) **tidak dinilai** — nama field yang tidak ada
   di snapshot dilewati, jadi klaim salah tentang field itu lolos. Perluasan yang sama dengan (1).
3. Tanda kurung hanya dinilai kalau diawali kata tipe yang dikenal (`date`, `DateTime`,
   `Select:`, `.`). Versi pertama menangkap `{2,90}` karakter dan menelan prosa:
   `TODO.md:1083` (`is_processed (F-62 — …)`) dan `pocketbase_schema.md:78`
   (`created (dugaan, …)`) ikut merah padahal keduanya kalimat, bukan klaim tipe. Dua
   positif-palsih buatanku sendiri itu yang menurunkan angka 29 -> 27 sebelum pemeriksaan rule.

Jebakan baru dari sesi ini (berulang, jadi dituliskan lagi): **menimpa berkas dengan `Write`
sebelum membacanya whole-file menghancurkan isi.** `docs/01_architecture/ai_strategy.md` (23
baris di HEAD) saya tulis ulang dari potongan `sed -n '5,20p'` dan §4 "Masa Depan: Local LLM"
hilang beserta judul aslinya. Ketahuan dari `git diff` (11 masuk / 7 keluar) lalu dipulihkan
`git checkout HEAD -- <file>` dan diverifikasi `wc -l` = 23 + `git status` bersih sebelum edit
satu baris yang sebenarnya. Untuk berkas yang sudah ada: baca seluruhnya, atau pakai `Edit`.

---

## Status 2026-10-09 (malam 2) — gelombang 4 kelompok 1: kebenaran state

Langkah 6 urutan yang direncanakan, **kelompok 1 dari 3**. Yang ditutup di sini: **F-50, F-64,
F-65**, plus satu penjaga untuk **F-63** yang ternyata sudah beres di PR #24. Sisa gelombang 4
dipecah dua kelompok lagi karena alasan yang terukur, bukan ukuran diff: **F-49 + F-61** adalah
permukaan mati (menyentuh `package.json` dan perlu build ulang untuk menutup sisa F-06/F-27),
sedangkan **F-52 + F-57** menyentuh `pb_migrations/**` — dan `deploy.yml` punya path filter
`pb_migrations/**`, jadi kelompok skema itulah yang nanti men-deploy saat masuk `main`.

| ID | Keadaan | Bukti terukur |
|---|---|---|
| **F-50** | **ditutup** — `syncUpdateTask`, `syncToggleTask`, `syncSnoozeTask` mengisi array `tasks` dari **respons server**, bukan payload klien. Audit cuma menyebut yang pertama; dua lainnya satu kelas (sama-sama menulis tanggal ISO ber-"T" ke state) dan diperbaiki bersamaan supaya "dua format beredar" tidak menyisakan satu. | Diukur hidup di backend uji: kirim `start_time = "2026-10-09T13:06:37.341Z"` -> server membalas `"2026-10-09 13:06:37.341Z"`, **geser 0 ms**, respons **16** kunci (`alarm_minutes_before, category, collectionId, collectionName, created, description, duration_minutes, end_time, has_alarm, id, is_completed, priority, start_time, title, updated, user`) yang memuat **11** kunci tipe `Task` di store — jadi menimpa seluruh elemen state tidak menghapus field. Mutasi `{ ...t, ...updates }` kembali -> `RED F-50 … masih menambal state dengan payload klien`. |
| **F-64** | **ditutup** — kosakata periode pindah ke `lib/periods.ts` (**86** baris): `TIME_BUCKETS`, `ENERGY_PREFS`, `bucketOfHour`, `PREF_BUCKET`, `PREF_PEAK_HOURS`, `energyStatus`, `emptyHeatmap`, `periodMatchSentence`. Insights tidak lagi menulis `h >= 6 && h < 12`; jendela chip energi yang dulu hidup sendiri di `app/(tabs)/index.tsx:19-26` ikut pindah. Kartu sekarang membandingkan pref dengan data, contoh nyata: `3 of 10 sessions this week were in the morning, but you picked Night Owl.` | `bucketOfHour` dinilai per jam 0..23 -> **6/6/12** (Evening mencakup lewat tengah malam); **13** kasus chip energi dinilai eksplisit dan sama dengan perilaku lama, termasuk `Afternoon,17 -> "Building Momentum"` (jendela pref sengaja 12–17, beda dari heatmap 12–18). Mutasi: `Afternoon: [[12,17]] -> [[12,18]]` -> merah; `PREF_BUCKET['Night Owl'] -> 'Afternoon'` -> merah **2** alasan (peta + kalimat); buang `bucketOfHour(` dari Insights -> merah "gerbang kehilangan pegangan". Gerbang enum baru (`test:enum` jadi **8** sumber): `ENERGY_PREFS` wajib persis select `Profiles.energy_pref`; mutasi `'Night Owl' -> 'Night'` -> `RED lib/periods.ts :: ENERGY_PREFS :: "Night" tidak ada di select server -> create/update Profiles ditolak 400`. |
| **F-65** | **ditutup** — rasio dibuang, bukan dihaluskan. `lib/snoozeLedger.ts` (**73** baris) menyimpan jumlah per hari kalender perangkat; store mempersist ke AsyncStorage dengan kunci **per user** (`snooze_ledger:<id>`) dan memangkas ke awal minggu saat hydrate; kartu Insights membaca dua angka absolut (`snoozesOn` hari ini, `sumSince` sejak Senin) dan tidak lagi menyentuh `stats.totalCount`. | Ledger: hari ini **2** / kemarin **1** / sejak kemarin **3** / batas sesudah semua hari **0**; `bumpSnooze` terbukti tidak mengubah objek lama; roundtrip `serialize -> parse` identik; **12** bentuk sampah storage ditolak (`null`, `''`, `'bukan json'`, `'{'`, `'[]'`, `'3'`, `'{"a":"x"}'`, nilai `null`/`-3`/`1.5`/`1e999`, kunci non-numerik). Mutasi: buang `AsyncStorage.setItem` -> `RED F-65 … tidak menulis storage`; longgarkan validasi `parseLedger` -> merah 4 kasus; ganti pembaca ledger dengan `stats.totalCount` -> `RED … kartu Insights tidak membaca ledger`. |
| **F-63** | **sudah tertutup lebih dulu** (PR #24) — `getWeekRange()` (`app/(tabs)/insights.tsx:366-371`) memakai `localWeekStart()`, sama seperti `loadRealData()`. Yang belum terjaga adalah **indeks kolom** heatmap: masih ditulis `(d.getDay() === 0 ? 6 : d.getDay() - 1)` di dalam `forEach` sesi, satu rumus ketiga di samping helper. Sekarang `localWeekDayIndex()` (`lib/localDay.ts`) dan dinilai. | Sweep **2184** titik waktu (1 Sep – 30 Nov 2026, per jam) dicocokkan dengan rumus independen `(getDay()+6)%7`: **0** meleset. Mutasi `Math.floor -> Math.round` -> `RED F-64 … 1092 titik waktu keluar dari kolomnya, contoh 2026-09-01T05:00:00.000Z -> 2 (harapan 1)` — ini bug pembulatan **jam**, bukan hari, dan hanya terbendet karena sweep-nya per jam. |

Perkakas keadaan akhir, semuanya `rc=0`: `typecheck`; `test:findings` **19** baris hijau
(sebelum PR ini 16); `test:enum` **8** sumber; `test:docs`; `test:batch`. Anti-vakum: **9**
mutasi, **9** menghasilkan `rc=1` dengan merah pada ID yang benar dan **0** hijau-palsu;
pemulihan diverifikasi `md5` pada **5** berkas (`store/useStore.ts`, `lib/periods.ts`,
`lib/snoozeLedger.ts`, `lib/localDay.ts`, `app/(tabs)/insights.tsx`) lalu kedua gerbang
dijalankan ulang dan hijau lagi. Skrip mutasinya sekali-pakai (`tools/test/tmp/`), jadi angka
di atas tidak bisa diulang dari repo — yang bisa diulang adalah gerbangnya.

Yang berubah di layar, supaya tidak perlu dibaca dari diff:

- Kartu "Snooze Rate … %" -> "Snooze" dengan angka hari ini dan "N since Monday".
- Kalimat "Best Time to Focus" sekarang menyebut preferensi user; dulu cuma
  `x of y focus sessions this week were in the evening.`
- Chip energi dashboard **tidak** berubah — 13 kasus jam dinilai justru untuk memastikan
  pemindahan kode tidak mengubah perilakunya.
- Tidak ada perubahan skema, `pb_hooks/**`, atau path pemicu deploy pada PR ini.

Batas yang jujur: `store/useStore.ts` mengimpor AsyncStorage dan `@/lib/pocketbase` sehingga
**tidak bisa dimuat node**. Karena itu dua hal dinilai dari **sumber**, bukan dari perilaku:
"state diisi respons server" (F-50) dan "ledger dipersist per user" (F-65). potongannya
dipotong **per fungsi** (`syncUpdateTask`/`syncToggleTask`/`syncSnoozeTask`), bukan grep global,
karena `updateTask` — aksi lokal — memang berhak menambal `{ ...t, ...updates }`. Perulangan yang
masih butuh bukti perangkat: buka aplikasi ulang lalu angka snooze masih ada, dan dua akun di
satu ponsel tidak saling mewarisi ledger. Kedua kalimat itu juga yang ditulis baris hijau
gerbang, bukan diklaim selesai.

---

## Status 2026-10-09 (malam 3) — gelombang 4 kelompok 2: permukaan mati

Langkah 6 urutan yang direncanakan, **kelompok 2 dari 3**. Kelompok 1 (F-50, F-64, F-65) sudah
tergabung ke `dev` sebagai merge PR #29 (`6aac31b`), dengan seluruh gerbang hijau di CI
(`Type-check`, `Skema PocketBase + hook AI`, `Kontrak enum + batch tulis task`, `Kontrak dokumen
terhadap skema`, `Lint perkakas shell`, `Scan rahasia di file ter-track` = 6 pass, `main hanya
hasil merge PR` = skipping karena PR ini tidak menyentuh `main`).

Yang dinilai di kelompok ini: **F-49** dan **F-61** — dua temuan yang isinya bukan "kode salah"
tapi "kode yang berbohong". Karena itu bentuk perbaikannya beda: yang dibutuhkan adalah gerbang
yang menahan diri sendiri dari bohong berikutnya, bukan tes perilaku.

### F-49 — keputusannya "cabut", dan alasannya diukur dua arah

Dua sisi dari satu fitur diukur terpisah:

- **Sisi server: terbukti bekerja.** `GET /api/realtime` -> `200` `text/event-stream`, frame
  `PB_CONNECT` membawa clientId (di `id:` dan di `data.clientId`). `POST /api/realtime` dengan
  body `{clientId, subscriptions:["Tasks/<id>","Tasks"]}` + header `Authorization` dari
  `authStore` -> `204`, dan `action=update` datang dalam **3–6 ms** dengan `record` **16** kunci.
  Ini persis urutan yang dilakukan `pocketbase@0.26.9` (dibaca dari `sendSubscriptions()` di
  `node_modules/pocketbase/dist/pocketbase.es.mjs`; SDK 0.26.9 mengirim ke `/api/realtime`,
  bukan `/api/realtime/subscriptions`).
- **Sisi isolasi: terbukti aman.** Klien B melanggan koleksi yang sama dan menerima record
  miliknya; stream A — yang juga melanggan `Tasks` — memuat **0** frame berisi id record B.
  Probe tambahan: langganan **tanpa** `Authorization` tidak menerima apa pun. Jadi realtime di
  PocketBase 0.40.4 tidak membuka jalur baru lintas user; aturan list yang sama berlaku di SSE.
- **Sisi React Native: tidak terbukti, dan tidak bisa dibuktikan sesi ini.** Yang dibutuhkan:
  `react-native-sse` benar-benar terhubung di dev client, reconnect saat aplikasi
  latar/depn, dan — yang paling penting — apakah Cloudflare Tunnel meneruskan SSE tanpa buffer.
  `adb` tidak ada, tidak ada perangkat tersambung, dan backend produksi tidak boleh ditembak
  perkakas uji. Memasang fitur yang bagian tak-terbuktinya justru terbesar = mengulang F-49
  dengan kode yang lebih banyak.

Maka yang dibuang: polyfill, komentar, dependensi. Yang disimpan: **probenya jadi gerbang
`F-49b` di `tools/test/findings.mjs`** — keputusan "cabut" sekarang punya dasar yang bisa
dijalankan ulang, dan siapa pun yang memasang realtime nanti sudah punya spesifikasi wire yang
terbukti (endpoint, bentuk body, topik `Koleksi/<id>`, `204`, bentuk event, dan syarat auth).
Gerbang F-49 sendiri dibuat **koherensi**, bukan larangan: polyfill tanpa pelanggan merah,
pelanggan tanpa polyfill merah, keduanya ada = hijau. Ini penting supaya pencabutan hari ini
tidak jadi aturan permanen yang harus "dihapus dulu" saat fiturnya nanti dipasang.

### F-61 — satu klaim audit ternyata salah, dan itu dicatat sebagai koreksi

| Item | Putusan | Alasan terukur |
|---|---|---|
| Tombol "Apple"/"Google" | **dihapus** (beserta divider + 6 gaya) | `TouchableOpacity`-nya **tidak punya `onPress`** sama sekali — bukan stub tertunda; dan `POST /api/oauth2/auth?provider=google` -> **404** di backend uji. |
| `avatar_url` di tipe `Profile` | **dihapus dari klien** | **0** pembaca, **0** unggah berkas. Field di skema tetap ada — itu keputusan kelompok 3. |
| `onboardingComplete` + setter | **dihapus** | `grep -rn setOnboardingComplete app components lib` -> **tidak ada** (rc=1). |
| `expo-calendar` | **dihapus dari dependencies** | Nol import, tidak muncul di `app.json > plugins`, tapi `expo prebuild` tetap menaruh `READ_CALENDAR` + `WRITE_CALENDAR` di manifest. Sesudah dicabut: `diff` manifest = **persis dua baris izin itu hilang**, sisanya identik (7 -> 5 `uses-permission`). |
| `WEEK_LABELS` | **TIDAK dihapus — klaim audit salah** | Masih dipakai sebagai `labels:` di `LineChart` (`insights.tsx:213`). Gerbang sekarang menahan dua arah: deklarasi tanpa pemakaian -> merah. |
| `PAUSE_FOCUS` / `RESET_FOCUS` | **ditinggalkan, sengaja** | `test:enum` mengikat union ke `EVENTS` di migrasi **dua arah**, dan `PAUSE_FOCUS` bukan nilai mati — ada kontrol Pause/Resume nyata (`app/focus.tsx:71-76`) yang belum pernah menulis event. Menyempitkan = perubahan `pb_migrations/**` -> kelompok 3. |
| `Focus_Sessions.completed`, `Workspace_Events.is_processed`/`payload` | **ditinggalkan** | Keduanya **ditulis** (`app/focus.tsx:130`, `:33`), hanya tidak dibaca. Menghapus = skema + nasib `Workspace_Events` (F-62) -> kelompok 3. |

### Perkakas, anti-vakum, dan dua jebakan yang mengulang dirinya sendiri

`typecheck`, `test:findings` (**22** hijau, naik dari 19), `test:enum`, `test:docs`, `test:batch`
semua `rc=0`. **9** mutasi -> **9** `rc=1` dengan merah pada ID yang benar, **0** hijau-palsu,
pemulihan diverifikasi `md5` pada 6 berkas. Bundel RN lewat Metro: **8.243.230** byte, `http=200`,
**0** `Unable to resolve module`.

Dua jebakan yang sudah pernah dicatat sesi sebelumnya muncul lagi, dan keduanya kujatuh sendiri:

1. **Komentar menipu grep.** Tulisanku di `lib/pocketbase.ts` — "belum ada satu pun
   `pb.realtime.subscribe()`" — terhitung sebagai *pemanggilan* oleh scanner baru, membuat F-49
   MERAH pada kode yang benar. Perbaikannya di gerbang (`tanpaKomentar()`), bukan dengan
   mengubah kata di komentar. Pelajaran yang sama pernah terjadi pada bundel dev: komentar tidak
   dibuang, jadi setiap klaim "identitas X sudah hilang dari bundel" harus dibaca setelah
   komentar dibuang. Akibatnya dua laporan bundel kali ini sengaja tidak dipakai sebagai bukti:
   `logo-apple` tetap **3x** dan `logo-google` **2x** (Ionicons membundel seluruh peta glyph),
   `EventSource` tetap **2x** di dalam modul realtime `pocketbase` — mencabut polyfill tidak
   membuang kode klien SDK, hanya transport SSE-nya.
2. **Perkakas yang menulis file yang sedang kuedit.** `npx expo prebuild` mengubah
   `package.json` (skrip `android`/`ios` -> `expo run:*`). Untuk memulihnya aku `git checkout --
   package.json`, dan itu ikut **menghapus dua baris dependensi yang sudah dicabut**. Terpantau
   dari `git status` (package.json hilang dari daftar berubah), dipasang ulang dengan
   `npm uninstall` supaya `package.json` + lock tetap satu sumber. Aturan yang lebih aman: kalau
   satu perintah mengubah berkas yang ada diff-nya, jangan `git checkout -- <file>` —
   balikkan bagian yang spesifik.

## Status 2026-10-09 (malam 4) — gelombang 4 kelompok 3: skema (F-52, F-57)

PR #30 kelompok 2 sudah masuk `dev` (`6aac31b..527aeed`) dan **tidak men-deploy apa pun** — ia
tidak menyentuh satu pun path filter `deploy.yml`. Kelompok 3 adalah kelompok pertama yang
menyentuhnya: branch `fix/skema-sisa` mengubah `pb_migrations/**`, jadi **merge ke `main` akan
menyalakan `deploy.yml`** (pub/sub → agen root di VM → pasang + restart). Merge ke `dev` tetap
aman. Ini sengaja dinyatakan ke pemilik sebelum ada PR ke `main`.

**F-52 — putusannya: riwayat fokus dipertahankan, relasi dilepas.** Yang kuukur di backend uji,
bukan disimpulkan dari kata `cascadeDelete`: `DELETE` task **sukses**, dua sesi yang menunjuknya
**tetap ada** dengan `task = ""` (SET-NULL — bukan RESTRICT yang menolak hapus, bukan CASCADE yang
membawa riwayat), `duration_seconds` dan `completed` utuh, jumlah sesi user **3 → 5** (+2 probe,
0 hilang). `insights.tsx` tidak menyebut `.task` **sedikit pun**, jadi statistik mingguan tidak
peduli pada sesi yatim — itu alasan tidak ada perubahan UI. Putusan sekarang dijaga gerbang
`GREEN F-52`: lengan perilaku (server), lengan `cascadeDelete/required` (file), dan lengan statis
"insights tidak menyentuh `.task`".

**F-57 — snapshot sekarang berdiri sendiri.** Angka pembedanya: sebelum, install fresh dari
snapshot saja membalas `createRule = "@request.auth.id != \"\""` untuk tiga koleksi dan
`Workspace_Events` dengan **7** field; rantai penuh punya createRule kepemilikan dan **8** field.
Sesudah resnap, install **snapshot-saja** identik dengan rantai penuh — 9 koleksi, **76** field,
cocok butir demi butir — dan lintas-user write **400**, anonim **400**, milik sendiri **200**,
`event_type` haram **400**. Enam nilai yang benar-benar berubah (3 `createRule`, `occurred_at`,
pattern `event_type`, `oauth2.providers` di 2 koleksi); diff jadi **+43/−20** setelah kunci
diurutkan, dari +182/−168 kalau urutan API dibiarkan.

Tiga hal yang kuukur dulu sebelum menulis klaim:

1. **Resnap tidak mengubah env yang sudah berjalan.** Di container throwaway yang sudah
   menerapkan ketiga file, `listRule` ketat di dalam `1790909763` kuganti `null` lalu
   `docker restart` → **0** kunci berubah, `Tasks.listRule` masih ketat. File yang sudah tercatat
   diterapkan tidak dijalankan ulang. Konsekuensinya dua sisi: produksi tidak tersentuh oleh edit
   ini, **dan** justru karena itu rantai file-lah satu-satunya yang dipulihkan saat bencana —
   itu isi F-57.
2. **Index `idx_events_user_occurred` tidak bisa ikut ke snapshot.** Env yang sudah menjalankan
   #3 membalas `indexes: []` pada `GET /api/collections/Workspace_Events`, padahal index-nya ada:
   `app.db().createIndex()` menulis di luar model koleksi. Restore dari snapshot saja kehilangan
   index itu (akibatnya di jalur baca, bukan di aturan akses), dan memindahkannya ke `indexes`
   snapshot membuat #3 gagal di install fresh (`createIndex` tanpa `IF NOT EXISTS`). Ditulis di
   komentar file supaya tidak "diperbaiki" oleh orang yang tidak tahu angka ini.
3. **`docs-contract` boleh diperketat sekarang.** Komentar lama gate itu jujur bahwa ia hanya
   menilai "teks rule PERNAH ada di skema" dan bahwa memperbaiki itu butuh resnap (F-57). Sesudah
   resnap, rule dibaca dari snapshot saja; migrasi sesudahnya jadi penjaga — rule yang tidak ada
   di snapshot membuat gate mati dengan `rc=1` (dibuktikan dengan mutasi `up` pada #2).

Perkakas: `tools/test/snapshot-f57.mjs` + `npm run test:snapshot` + langkah CI baru di job `schema`
(container kedua, port 8091, hanya file snapshot yang di-mount). `test:findings` naik **22 → 24**
hijau dan angka itu juga hijau di **install fresh replika CI** (port 8098, `pb_data` kosong, hooks
+ migrations: `pb-schema-verify` **21** baris `OK` / **0** gagal, `rc=0`, seed 4 dibuat/1 ditolak).
Angka **17/17** yang kutulis pada ronde sebelumnya di paragraf ini salah dan sudah kucabut: tool
itu tidak mencetak penyebut `n/n`, jadi "17" adalah hitunganku sendiri terhadap skema waktu itu —
dihitung ulang terhadap skema sekarang = 21. CI run PR #31 sendiri membalas **24** `GREEN` di
langkah findings + **2** `GREEN` di langkah snapshot, **0** `RED`. Lima mutasi anti-vakum
(M1 file pra-resnap, M2b `required` di file, M3 `cascadeDelete` di file, M4 `cascadeDelete` di
server, M5 rule asing di up-#2) semuanya tertangkap di lengan yang benar; pemulihan diverifikasi
`md5` (snapshot `ecabd128…`, #2 `8eae8279…`) dan server uji dikembalikan sampai definisi
`Focus_Sessions`-nya **sama butir demi butir** dengan salinan sebelum mutasi.

Hal yang lahir dari menjalankan, bukan dari membaca kode:

- **Gate-nya sendiri punya bug:** menghapus satu kunci dari array snapshot meninggalkan koma
  menggantung dan `snapshot-f57.mjs` mati sebagai tumpukan `JSON.parse`. Kedua pembaca snapshot
  sekarang mem-parse dalam `try` dan mati dengan pesan posisi. Ini jebakan kelas H1 (perkakas yang
  gagal terdengar seperti temuan).
- **Mount `pb_migrations` RW menuliskan artefak ke repo.** PocketBase 0.40.4 membuat file migrasi
  otomatis setiap koleksi diubah lewat API, dan container uji mem-mount direktori migrasi repo
  secara tulis. Mutasi M4 melahirkan `1791547748_updated_Focus_Sessions.js` +
  `1791547785_updated_Focus_Sessions.js` di working tree. Keduanya tidak kukommit dan sudah
  dihapus. Aturan baru untuk probe skema: mount **salinan** direktori (mis. `/tmp/pb-snap-only`),
  jangan repo — kalau tidak, artefak mutasi ikut masuk PR dan `deploy.yml` membacanya sebagai
  perubahan skema.
- **Gate bisa menyalahkan server padahal environment sendiri yang kurang.** `npm run test:snapshot`
  tanpa `PB_SU_PASSWORD` membuat PocketBase membalas *An error occurred while validating the
  submitted data* dan tool menulis "Superuser tidak bisa masuk di http://127.0.0.1:8097" — tuduhan
  ke backend, padahal nilai bawaan di kode memang kosong (sengaja: tidak ada rahasia di kode).
  Sekarang ada guard `PB_SU_PASSWORD belum diisi` sebelum auth; terbukti `rc=1` dengan pesan itu,
  dan `rc=0` + dua hijau begitu env diisi.
- **Gate yang diperketat langsung menggigit TODO-nya sendiri.** Baris F-57 mengutip keadaan lama
  sebagai `createRule` longgar (verbatim `@request.auth.id != ""`); setelah teks itu hilang dari
  snapshot, gate membacanya sebagai klaim saat ini dan merah di `TODO.md:1418`. Gate tidak bisa
  membedakan kutipan historis dari klaim — jadi kutipannya ditulis ulang jadi prosa yang eksplisit
  menyatakan "teks itu tidak ada lagi di file". Melembangkan pengecualian file akan membuat F-57
  kembali tak terjaga.

### Konsekuensi `dev` → `main` sesudah kelompok 3 (terukur 2026-10-09, bukan diduga)

Dihitung dari `git diff --name-only origin/main...origin/dev` + riwayat `deploy.yml` lewat API,
bukan dari ingatan:

| Fakta | Angka |
|---|---|
| Ujung `main` | `c86bb9a` (2026-10-07 23:17 +07, merge PR #21) — **24** commit di belakang `dev` (`3ad4876`) |
| Deploy terakhir ke VM | run **`#5`** sha `a1ef8c7`, `2026-10-07T13:28:10Z`, `completed/success` (run `#4` `5788455` adalah yang tercatat di `TODO.md` M9 P9; `#5` kemudian, `completed success`) |
| File pemicu deploy yang berbeda `main`↔`dev` | **4**: `pb_hooks/ai_proxy.pb.js`, `pb_migrations/1790909763_collections_snapshot.js`, `pb_migrations/1791526402_workspace_events_ketat.js`, `tools/deploy/pickertime-pb-agent.sh` (+12/−3) |
| `1790909763` yang di-resnap | **tidak** dijalankan ulang — `git cat-file -e` menunjukkan filenya **sudah ada** di `main`, jadi kunci `1790909763` sudah tercatat diterapkan di VM; bukti mekanismenya di §3 item 1 (mutasi `listRule` + restart → **0** kunci berubah). Rantai `main` tetap benar karena `1790909800_ownership_create_rule.js` **juga sudah ada** di `main` dan menugaskan rule yang sama |
| `1791526402_workspace_events_ketat.js` | **belum ada di `main`** (`fatal: path … exists on disk, but not in 'origin/main'`) → deploy berikutnya **menerapkannya nyata**: `occurred_at` + pattern `event_type` di produksi |
| Risiko klien lama | hook di `dev` membalas **410** pada `POST /api/ai/gemini` untuk yang login (`pb_hooks/ai_proxy.pb.js:165-168`), sementara build dari `main` masih memanggil path itu (`lib/gemini.ts:35`) → AI pada build lama **putus** sampai aplikasi di-*rebuild* dari `dev`. Tidak ada user nyata (gelombang 2 justru ditutup "sebelum ada user nyata"), jadi yang terpengaruh hanya build milik pemilik |
| Jebakan rollback agen | **tidak** terjadi: rute 410 tetap dipasangi `$apis.requireAuth()` (`pb_hooks/ai_proxy.pb.js:170`), jadi agen yang **sudah terpasang di VM** — yang memeriksa "anonis harus 401" di path lama — tetap lolos; `dev` juga menambah fallback `404 → path lama` di `pickertime-pb-agent.sh` (+12/−3) untuk deploy sebelum hook sempat pasang |
| Restart | `deploy.yml` memasang lalu merestart PocketBase → **M8.1** berlaku: kredensial superuser kembali ke nilai env container |

Karena itu merge ke `main` **bukan** langkah otomatis dari kelompok 3: ia menyalakan deploy,
menerapkan satu migrasi nyata, dan memutus build lama di jalur AI. Keputusannya ada di pemilik.

Belum diselesaikan di kelompok ini (butuh keputusan pemilik, bukan pembersihan sunyi):
penghapusan field write-only (`Focus_Sessions.completed`, `Workspace_Events.is_processed`/`payload`,
`Profiles.avatar_url`) yang berarti **membuang data** lewat migrasi baru; nasib `Workspace_Events`
(F-62); penyempitan `EVENTS` untuk `RESET_FOCUS` sementara kontrol Pause/Resume di
`app/focus.tsx:71-76` nyata tapi tidak pernah menulis event — itu kurang tulis, bukan skema longgar.

---

## Status 2026-10-09 (malam 5) — F-71 terukur, F-69 dikunci (gelombang 3.5 sebagian)

Pemilik memilih **tahan `main`**: satu deploy nanti membawa kelompok 3 + kunci model. Jadi yang
dikerjakan di sini hanya bagian F-69 yang tidak butuh keputusan vendor — mengunci nama model.
Router `AI_PROVIDER` (F-73), pagar anggaran (F-72) dan Vertex via metadata server (F-74) masih
terbuka.

**Cara ukur yang direncanakan action plan ini salah, dan itu penting.** Perintahnya:
`GET /v1beta/models/gemini-flash-lite-latest` dengan key produksi, catat `baseModelVersion`.
Dijalankan di VM (`hermes-openclaw-vm`) dengan key dibaca dari `/opt/pickertime/.env` **di dalam
proses** — tidak pernah dicetak, tidak pernah jadi argemen (H8): respons metadata untuk model
apa pun hanya berisi `description, displayName, inputTokenLimit, maxTemperature, name,
outputTokenLimit, supportedGenerationMethods, temperature, thinking, topK, topP, version`. **Tidak
ada `baseModelId`**, **tidak ada field retirement/pensiun di 62 model yang terdaftar**, dan untuk
alias `version` hanyalah label manusia (`"Gemini Flash-Lite Latest"`). Kesimpulan yang harus masuk
register: *isi alias tidak bisa diaudit dari endpoint metadata*; satu-satunya pengukuran yang
berfungsi adalah `modelVersion` pada respons `generateContent`.

| Dipanggil | `modelVersion` balasan | latency | token | 
|---|---|---|---|
| `gemini-flash-lite-latest` | `gemini-3.5-flash-lite` | 597 ms | 23+25=48 |
| `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | 589 ms | 23+25=48 |
| `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | 689 ms | 23+19=42 |

**Koreksi ke §3.5 dokumen ini:** premis "kalau alias saat ini resolve ke jalur 2.5, perilakunya
berubah/putus pada 20 Oktober 2026" diuji dan **hari ini tidak berlaku** — alias resolve ke jalur
3.5 (`gemini-3.5-flash-lite`). Yang tetap berlaku adalah alasan strukturalnya: mapping itu di tangan
Google, dan tanggal pemadaman **tidak** bisa dibaca dari API mana pun yang kuakses, jadi ia tidak
kupakai sebagai dasar keputusan. Pin ke `gemini-3.5-flash-lite` dipilih justru karena **nol
perubahan**: `modelVersion`, jumlah token dan teks outputnya identik dengan panggilan alias
(baris 1 vs baris 2 tabel di atas), sementara `gemini-3.1-flash-lite` satu generasi lebih lama dan
berbeda perilakunya (689 ms, 42 token, judul beda).

**Yang diubah.** `pb_hooks/ai_proxy.pb.js:97-98`: `const MODEL = "gemini-3.5-flash-lite"` dan URL
dibangun dari `MODEL`. Sengaja **tanpa** override env: kalau nilainya bisa diganti lewat env,
seseorang bisa memasang `-latest` lagi tanpa menyentuh kode dan tanpa tertangkap CI. Gerbang
`GREEN F-69` di `tools/test/findings.mjs` memeriksa bentuk kodenya (MODEL ada, tidak kena
`-latest`, URL dibangun dari MODEL, **0** literal `models/*:generateContent` di baris kode), dan
**3** mutasi membuktikan ketiganya hidup: alias di `MODEL` -> merah; hapus `MODEL` + inline alias
-> merah dengan tiga alasan; inline **nama yang benar** tanpa `MODEL` -> tetap merah, karena gerbang
kehilangan sumbernya.

**Bukti tidak berhenti di teks.** Hook dimuat PocketBase (`POST /api/ai/complete` dan jalur lama
sama-sama **401** anonim di `pt-pb-test`; `docker logs --since 10m` **0** baris error), kontrak
respons utuh (`pb-schema-verify` `rc=0`, **21** `OK`, **0** gagal; yang login dapat **502**
`code=unavailable` generik tanpa menyebut vendor, jalur lama **410** `code=moved`), dan `test:findings`
naik **24 → 25** hijau. Catatan M8.1 yang mengulang dirinya sendiri: `pb-schema-verify` sempat mati
di baris 28 dengan `ClientResponseError 400 "Failed to authenticate."` di `pt-pb-test` — penyebabnya
kredensial superuser container itu = env container (panjang **13**/**39**), bukan literal CI; ini
bukan regresi kode dan tidak boleh dicatat sebagai temuan skema.

Jebakan kedua di sesi yang sama, dan ini **bug perkakas**, bukan environment: `pb-schema-verify`
menjatuhkan `BASE = undefined` kalau argumen pertamanya lupa diberikan, lalu tetap mencetak
`OK undefined :: superuser.auth :: ok` (pemeriksaan itu tidak menyentuh jaringan) sebelum mati di
request pertama dengan `ClientResponseError status 0` pada
`/api/collections/_superusers/auth-with-password`. Run itu sempat saya baca sebagai "regresi hook"
padahal pemanggilnya yang salah — persis kelas kegagalan yang dikejar H1. Perbaikannya di file yang
sama: tanpa `argv[2]` -> keluar **2** dengan baris pemakaian; `BASE` yang memuat `elarisnoir` ->
keluar **1** **sebelum** satu request pun keluar, karena perkakas ini menulis dan menghapus record
dan selama ini tidak punya guard produksi (yang punya hanya `snapshot-f57.mjs:18`). Keduanya diuji
langsung: `rc=2` dan `rc=1` dengan pesan yang benar. Setelah edit, pemanggilan yang sah tetap
`rc=0` dengan **21** `OK` / **0** `FAIL` (angka tidak berubah), dan `test:findings` tetap **25**
hijau — blok F-60 membaca isi file ini, jadi perubahannya ikut dinilai gerbang.

**Koreksi angka blast radius (kelas H1, kesalahan sendiri di sesi ini).** Kalimat pertama bagian ini
saya tulis dengan dugaan bahwa kunci model menambah **satu** file pemicu `deploy.yml` di atas **4**
yang dicatat M19 di atas. Diukur ulang sesudah PR #33 masuk `dev`
(`git diff --name-only origin/main...origin/dev | grep -E -e '^(pb_hooks/|pb_migrations/|tools/deploy/)' -e '^\.github/workflows/deploy\.yml$'`):
jumlahnya tetap **4** — `pb_hooks/ai_proxy.pb.js` sudah lebih dulu ada di daftar M19 (baris 570
dokumen ini), jadi PR ini mengubah **isinya**, bukan menambah file pemicu baru.
`.github/workflows/deploy.yml` tidak muncul di diff (identik di `main` dan `dev`), dan merge ke
`dev` terbukti tidak men-deploy: `gh workflow view deploy.yml` mencetak **Total runs 5** dengan run
terakhir tetap `#5`. Untuk persetujuan pemilik, angka yang berlaku: **28** commit `main`..`dev`,
**48** file berbeda, **4** file pemicu deploy, **1** migrasi baru yang belum pernah jalan di produksi
(`1791526402_workspace_events_ketat.js`).

---

## Keadaan produksi terukur, pra-deploy (2026-10-10)

Diukur lewat IAP SSH ke `hermes-openclaw-vm` dengan skrip yang dijalankan `sudo python3 -` dari
stdin (berkasnya di `tools/test/tmp/`, di-gitignore). Semuanya **baca-saja**: satu koneksi
`sqlite3` `mode=ro`, `docker inspect`, `os.listdir`, `GET /api/records`. Tidak ada tulis, tidak ada
`rsync`, tidak ada restart, tidak ada `ack` pesan Pub/Sub.

| Yang diukur | Nilai | Artinya untuk satu deploy nanti |
|---|---|---|
| `_migrations` DB produksi | **10** baris. `1790909763_collections_snapshot.js` (batch 1790914253477868) dan `1790909800_ownership_create_rule.js` (1791379711184390) **sudah tercatat**; `1791526402_workspace_events_ketat.js` **tidak ada** | Hanya **1** migrasi yang akan dijalankan. Snapshot yang saya ubah di `dev` **tidak** akan jalan ulang — persis semantik yang diukur di kelompok 3, kini terkonfirmasi di produksi asli |
| Baris per koleksi | `Profiles` **0**, `Tasks` **0**, `Focus_Sessions` **0**, `Workspace_Events` **0** | Langkah 2 migrasi (normalisasi ke `UNKNOWN` + backfill `occurred_at`) menyentuh **0** baris; sentinel `UNKNOWN` tidak akan pernah ada di produksi; `pattern` di langkah 3 tidak bisa ditolak data lama |
| Kolom `Workspace_Events` sekarang | `created, event_type, id, is_processed, payload, updated, user` = **7**, tanpa `occurred_at`; indeks: hanya `sqlite_autoindex` | Produksi memang skema pra-kelompok-3; deploy menambah `occurred_at` + `idx_events_user_occurred` |
| `/opt/pickertime/app/pb_migrations` | **2** berkas, sama persis dengan yang tercatat di DB; `app/pb_hooks` **1** berkas (`ai_proxy.pb.js`) | Tidak ada berkas yatim yang ditinggalkan `rsync` aditif (agen sengaja tanpa `--delete`) |
| `/opt/pickertime/releases` | **5** entri: `run-37209210419-5788455b`, `run-37628720967-a1ef8c74`, `run-manual-144007-a896d22a`, `run-manual-167929-a896d22a`, `run-manual-36374-b81b18a2` | Baseline rollback deploy terakhir (`#5` = run 37628720967) ada di disk; `workflow_dispatch` action=rollback tinggal menyebut `deploy_id` itu |
| Sisa rollback manual | `pb_hooks.rolledback-run-manual-36374-b81b18a2-rollback` dan `pb_migrations.rolledback-run-manual-36374-b81b18a2-rollback` masih di `$REMOTE_APP` | Tidak mengganggu deploy (di luar dua direktori yang di-rsync), tapi ini sampah hasil rollback manual — keputusan pemilik: hapus atau pindah |
| Container | image `ghcr.io/muchobien/pocketbase:0.40.4`, status `running`, `restart_count` **0**, `StartedAt` **2026-10-07T13:28:35Z**, policy `unless-stopped` | Deploy akan restart; `restart_count 0` = tidak ada crash-loop yang sedang menutupi penyebab lain |
| Mount | `/opt/pickertime/pb_data`→`/pb_data` (rw), `app/pb_hooks`→`/pb_hooks` (rw), `app/pb_migrations`→`/pb_migrations` (rw) | Rollback agen = tukar isi direktori ke baseline + restart, **bukan** restore DB |
| Env container vs `/opt/pickertime/.env` | panjang **identik**: `GEMINI_API_KEY 53`, `PB_ADMIN_EMAIL 29`, `PB_ADMIN_PASSWORD 48`; **0** var bernama `MODEL`/`GEMINI_MODEL` | Invarian M8.1 saat ini utuh (file = container) → restart deploy tidak memutus kredensial. Tidak ada jalur env yang bisa mengembalikan alias model: namanya hanya bisa berubah lewat PR |
| `data.db` | `/opt/pickertime/pb_data/data.db`, `uid 0 gid 0` mode **0600**, 217088 B, `-wal` 0 B | Catatan CFG-27 ("root:root **644**") **tidak lagi cocok** dengan keadaan terukur; mode-nya sekarang 600, jadi isinya tinggal dikoreksi, bukan dikerjakan |
| Backup | `backup-state.env`: `LAST_OK=2026-10-08T12:49:21Z`, `LAST_KEY=pb_backup_acme_20261008124918.zip`, `LAST_SIZE=294586`; dua arsip 2026-10-08 di `pb_data/backups` | Ada titik restore sebelum keputusan "buang data" yang ditunda (field write-only, F-62) |
| Jangkauan API dari host VM | `http://127.0.0.1:8090/api/health` -> **connection refused**; IP container `172.19.0.6:8090` -> **200**; superuser `auth-with-password` -> **200** (token 223), dan field wajibnya **`identity`**, bukan `email` | Setiap perkakas baca-produksi harus memakai `pb_ip()` seperti agen; dokumentasi yang menulis `localhost:8090` di host VM menyesatkan. Payload `email` menghasilkan **400** `identity: Cannot be blank.` |

Yang **tidak** berubah oleh deploy ini: **0** baris data ditulis atau dihapus, tidak ada koleksi yang
dibuat/dibuang, dan tidak ada satu pun kredensial yang disentuh.

## Insiden sesi ini: `GEMINI_API_KEY` produksi tercetak di keluaran terminal (butuh tindakan pemilik)

Probe baca-saja pertama saya mencetak `[x for x in json.loads(envs) if "GEMINI" in x]` — yaitu
pasangan `K=V` **lengkap**, sehingga *nilai* key produksi (53 karakter, awalan `AQ.`) muncul di
stdout dan ikut terdokumentasi di transkrip sesi ini. Nilainya **tidak** pernah saya tulis ke berkas
ter-track mana pun (scan rahasia di bawah tetap `0`), dan sumber kebocorannya adalah perintah saya
sendiri, bukan repo.

Yang harus dilakukan pemilik, dan tidak bisa saya kerjakan karena merupakan tulisan di Google:
**rotasi key di Google AI Studio** — perlakukan key ini sebagai sudah terbaca pihak ketiga. Setelah
rotasi, nilai baru **wajib** masuk ke `--env-file`/`.env` **sebelum** `docker run` ulang, sesuai
invarian M8.1; kalau hanya diganti lewat dashboard, restart berikutnya menimpanya lagi.

Satu celah nyata ikut terlihat dari insiden ini: pola `secret-scan` di `ci.yml`
(`AIza[0-9A-Za-z_-]{20,}|gsk_…|ghp_…|github_pat_…|gho_…|cfut_…`) **tidak** mengenal bentuk key
`AQ.…`, jadi key yang bocor hari ini akan lolos dari gerbang kalau suatu saat masuk berkas.
Ditambahkan `AQ\.[0-9A-Za-z_-]{20,}`; diukur di `dev`: `hits_lama=0`, `hits_baru=0` pada seluruh
pohon ter-track (tidak ada positif palsu). Aturan turunannya saya tulis sebagai hutang proses H9 di
`TODO.md`: probe environment container hanya boleh mencetak **panjang** nilai, jangan pernah
mencetak `K=V`.
