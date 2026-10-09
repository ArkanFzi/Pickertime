# Hermes sebagai sentral — topologi, guardrail, dan tahap persiapan

Dihasilkan dari sesi 2026-10-08. **TAHAP 0 sudah diukur pada 2026-10-08** (F-75 tertutup, angka di §2);
dokumen ini tetap berkas kerja karena keputusan pemilik masih menunggu di §0/§9 dan Fase 1 lanjutan
masih terbuka. Register temuan + bukti lengkap pindah ke repo infra:
`config-agentic/docs/12-fase-1-dasar.md` (angka + bukti) dan `config-agentic/docs/11-fase-hermes-sentral.md`
(register CFG-01…CFG-27), branch `docs/fase-hermes-sentral`, commit `65d9395`.

Terkait: `docs/04_audit/action_plan_2026-10-08.md`. Penomoran bersama (terukur 2026-10-09 di kedua
repo): rencana audit itu berhenti di **F-74** dan menambahkan **F-79/F-80** pada gelombang kalender
2026-10-09 (semula dicatat F-75/F-76, dinomori ulang karena sudah dipakai di bawah), sehingga
**F-75/F-76/F-78** adalah nomor dokumen ini — F-75 = ukur VM (CFG-01), F-76 = gerbang indeks skill
(CFG-16), F-78 = bentuk kontribusi otak ke aplikasi.

---

## 0. Keputusan yang sudah kita ambil bersama

| Topik | Putusan |
|---|---|
| Peran Hermes | **Otak orkestrasi 24/7** di VM GCP — channel chat, penjadwal, memori, generator skill, pelapor. Bukan penerjemah prompt untuk 4 panggilan JSON mobile. |
| Model untuk jalur JSON Pickertime | **Tetap Gemini API, versi dikunci** (`gemini-3.1-flash-lite` / `3.5-flash-lite`), **bukan** alias `-latest`; Groq/OpenRouter gratis sebagai fallback. Alasan tanggal: jalur 2.5 dipadamkan 2026-10-20. |
| OpenCode Zen / Hermes di jalur mobile | Ditolak untuk sekarang (kurasi "untuk coding agents", bug fallback model mahal, satu wallet untuk semua user). |
| Ollama lokal | Tidak dipasang sekarang. Beban inference dipindah ke API gratis; Ollama hanya masuk akal kalau nanti ada syarat "data tidak boleh keluar". |
| Telegram vs WhatsApp | **Telegram dulu** (long-polling → tanpa inbound port, resmi, gratis). WhatsApp belakangan: Baileys = risiko banned, Cloud API = butuh webhook publik yang lewat tunnel tercatat punya 520 laten ~0,2%. |
| Pemisahan skill | Dipisah **berdasarkan wewenang** (working dir, tool allowlist, secret scope, channel+approval), bukan hanya topik. Skill per-repo di-commit bersama repo itu. |
| CI/CD | Hermes **read-only + lapor**, dengan jalur perbaikan terbatas pada allowlist aksi reversibel. Detail di §7. |

---

## 1. Topologi target

```
                ┌──────────────── VM hermes-openclaw-vm ────────────────┐
 Telegram ─────▶│ HERMES (sentral)                                      │
 (WB: belakangan)│  gateway channel · scheduler · memori · skills · miner │
                │  user non-root: hermes                              │
                │  TIDAK boleh: env PocketBase, topic Pub/Sub deploy, root │
                └───┬──────────────────────┬───────────────────┬────────┘
                    │ baca/tulis via PB API │ gh API (read-only)│ queue perintah (outbound)
              ┌─────▼──────┐        ┌───────▼────────┐   ┌──────▼───────────┐
              │ PocketBase │        │ GitHub Actions │   │ PC KERJA = TANGAN│
              │ (:8090)    │        │ (CI/CD)        │   │ browser/DND/file │
              └─────▲──────┘        └────────────────┘   └──────────────────┘
                    │ REST + realtime (belum dipasang, F-49)
              ┌─────┴──────────┐
              │ App Pickertime │  alarm & JSON tetap dilayani pb_hooks/ai_proxy.pb.js
              └────────────────┘
```

Prinsip: **otak memutuskan kebijakan pada jadwal; tangan mengeksekusi di tempat OS-nya ada;
jalur online aplikasi tidak boleh bergantung pada ketersediaan otak.** Lihat F-78.

---

## 2. TAHAP 0 — Pengukuran & baseline compat (hanya kamu yang bisa mengerjakan)

Sampai tahap ini selesai, tidak ada satu pun perubahan di VM yang aman untuk dijadwalkan.

```bash
# 2.1 Bentuk mesin
# repo tidak mencatat zone/instance secara lengkap (deploy.yml hanya PROJECT_ID +
# SERVICE_ACCOUNT), jadi daftar dulu:
gcloud compute instances list --project config-agentic-ubuntu
gcloud compute instances describe hermes-openclaw-vm \
  --zone <zone> --project config-agentic-ubuntu \
  --format 'value(machineType,status,disks.name,disks.type,disks.diskSizeGb,
            serviceAccounts[0].email,serviceAccounts[0].scopes,networkInterfaces[0].networkAccessConfig)'

# 2.2 Sisa nyata di dalam box
nproc; free -h; df -h / /var/lib/docker 2>/dev/null; docker stats --no-stream; docker ps -a

# 2.3 Yang sudah terpasang (versi = kunci compat)
hermes --version 2>/dev/null || which hermes
node -v; systemctl list-units --type=service --state=running | grep -Ei "pocketbase|hermes|cloudflared|backup|relay"
ls -la ~/.hermes/ 2>/dev/null; ls ~/.hermes/skills 2>/dev/null | head -40
sudo -n -l 2>/dev/null; id

# 2.4 Inbound/outbound
cloudflared --version; cloudflared tunnel list 2>/dev/null; ss -tlnp | head -20
```

Keluaran yang dibutuhkan (F-75): **machine type, RAM terpakai vs kosong, disk terpakai vs
kosong, versi Hermes + letak `~/.hermes/`, daftar service yang jalan, dan apakah proses
Hermes sekarang jalan sebagai root.** Poin terakhir itu yang menentukan sisa rencana ini.

**Selesai kalau:** angka-angka itu tercatat di dokumen ini (atau `TODO.md`), dan
`free -h` masih menyisakan ≥1 GB setelah semua yang ada sekarang jalan.

### F-75 TERTUTUP — terukur 2026-10-08 (`gcloud` + IAP SSH, semuanya read-only)

| Aspek | Angka |
|---|---|
| Mesin | `e2-medium` = 2 vCPU, zone `us-central1-a`, **tanpa IP eksternal** (IAP satu-satunya jalur), disk `pd-standard` 100 GB |
| RAM | total 3924 MB, terpakai 2169–2241 MB, **available 1683 MB**, swap terpakai 106 MB |
| Disk | 34 GB terpakai / **61 GB sisa (37%)**, inode 13%; `/home/arkan` 13 GB, `/var/lib` (Docker) 15 GB, `/var/log` 194 MB (journal 169 MB) |
| Kontainer | 10 jalan. Terbesar: `openclaw-gateway` 771 MiB, `litellm-proxy` 397 MiB, `hermes` 329 MiB. **Hanya 2 yang punya batas** (`hermes` 2 GiB/1,5 CPU, `gemini-agent` 1 GiB/0,5 CPU) — 8 lainnya `mem=0` |
| Proses Hermes | `uid=1000(hermes) groups=1000(hermesgid)` — **bukan root**, tanpa grup docker, tanpa `docker.sock` |
| Gateway | **sudah hidup** di bawah s6 (`hermes gateway run --replace`, pid 2594, `healthy`, `RestartCount=0`, start 2026-10-05T04:06Z). `sleep infinity` di compose hanya CMD yang tidak dipakai entrypoint |
| Scheduler | berdenyut: `cron/.tick.lock` tersentuh 2026-10-08 11:29; `cron/jobs.json` = **1** job (`tka-harian`, `30 16 * * *`) |
| Skills | **82** `SKILL.md` dalam 15 kategori |
| Provider otak VM | `model.provider = opencode-zen`, `model.default = **space-bunny-free**` (alias bebas tanggal), fallback `nvidia/nemotron-3-super-120b-a12b`; bridge `127.0.0.1:8646` **tertutup** (laptop-only); `custom_providers` kosong; `auxiliary.vision` tidak ada |
| Approvals / channel | key `approvals` **tidak ada**; 9 platform dideklarasikan, `platforms` key tidak ada, direktorinya hanya `pairing` → **nol channel aktif** |
| Inbound | loopback: 18789/8788/8789/4000/18000/25; **`0.0.0.0:8888`** (docs-web) masih terbuka ke jaringan internal; PocketBase **tidak** menerbitkan port ke host (`docker port` kosong) |
| root yang nyata | `litellm-proxy`, `chromadb`, `pickertime-pocketbase` = **root**; `openclaw-gateway` = `node` + grup `docker` → setara root host |

**(b) Verdict VM: cukup — VM kedua belum perlu.** Ambang ≥1 GB available lolos (1683 MB), disk sisa
61 GB. Yang membatasi bukan kapasitas, tapi **8 dari 10 kontainer tanpa batas memori** di box 3,9 GB:
satu proses yang bocor bisa meng-OOM-kan VM dan menjatuhkan gateway Hermes bersamanya. Ollama lokal
tetap tidak dipasang; VM kedua jadi keputusan terpisah kalau margin available jatuh di bawah 1 GB
setelah batas dipasang, atau saat penambang skill CPU-bound mulai jalan. `agentic-watchdog-vm`
(e2-micro, `10.128.0.3`) tidak bisa dijadikan kandidat karena tugasnya justru relay backup **di luar**
otak (§9).

**(c) Verdict root: Hermes TIDAK root.** Syarat "isolate sebelum channel dibuka" sudah terpenuhi di
sisi proses, jadi TAHAP 1.1 praktis selesai. Tapi pengukuran menemukan tiga lubang yang lebih besar
dari soal root/not-root (nomor CFG merujuk ke `config-agentic/docs/11-fase-hermes-sentral.md`):

1. **CFG-20 (paling penting untuk K-1).** Token metadata terbaca **dari dalam kontainer hermes**
   (`http=200` sebagai `uid=1000(hermes)`), dan identitas `hermes-openclaw@config-agentic-ubuntu`
   memegang `roles/pubsub.subscriber` pada `pickertime-pb-deploy-to-vm` **dan**
   `roles/pubsub.publisher` pada `pickertime-pb-deploy-results`. Proses apa pun di VM karena itu bisa
   **mencegat perintah deploy** dan **memalsukan `status=applied`** ke GitHub Actions. Yang **tidak**
   bisa: memulai deploy (topic `pickertime-pb-deploy` hanya memberi publisher ke `pickertime-cd@…`)
   dan menulis kode hook (`app/pb_hooks` + `app/pb_migrations` = `root:root 700`). Perbaikan termurah
   = cabut dua binding IAM itu, tanpa restart VM.
2. **CFG-27 / `data.db`.** `/opt/pickertime/pb_data/data.db` = `root:root 644` → **terbaca user mana
   pun** (bukti: `dd bs=1 count=64` rc=0 sebagai `arkan`). Ini DB produksi Pickertime, jadi temuan ini
   langsung menyentuh repo ini. `superuser.txt` (`600`) dan `~/.hermes/config.yaml` (`700` milik `node`)
   justru **DITOLAK** — jadi yang bocor spesifik file DB, bukan seluruh `/opt/pickertime`.
3. **CFG-21.** Token hidup tampil di argumen baris perintah dan terbaca lewat `ps` oleh user biasa —
   kelas kesalahan yang sama dengan yang sudah dicatat `TODO.md:373-377`. Nilainya tidak saya salin
   ke dokumen mana pun.

Dua hal yang tidak diubah oleh pengukuran: larangan keras §9 dan pemisahan otak/tangan §1. Yang
berubah adalah urutan realistis sekarang: **cabut CFG-20 → pasang batas memori (CFG-23) → kunci nama
model (F-69/K-5, `space-bunny-free` hari ini tidak bisa diaudit) → approvals → Telegram.** Semua aksi
tulis di VM dan IAM masih menunggu persetujuanmu; yang saya kerjakan hari ini semuanya read-only.

---

## 3. TAHAP 1 — Akun, isolasi, kredensial

| ID | Pekerjaan | Kenapa |
|---|---|---|
| 1.1 | Kalau Hermes saat ini jalan sebagai **root**, pindahkan ke service user `hermes` (non-root, `systemd --user` atau unit dengan `User=hermes`). | Ini satu-satunya perubahan yang membuat "jadi sentral" aman. Tanpa ini, skill yang salah = root di box produksi. |
| 1.2 | Pastikan user `hermes` **tidak bisa membaca** file env PocketBase (`PB_ADMIN_PASSWORD`, `superuser.txt`) dan tidak bisa publish/subscribe topic Pub/Sub deploy. Cek dengan `sudo -u hermes cat <path>` → harus `Permission denied`. | `deploy.yml:5-11` menyatakan kredensial superuser tidak pernah keluar dari VM; jangan buat agen yang menulis kode sendiri ikut memegangnya. |
| 1.3 | **Satu secret scope per konteks**: `~/.hermes/secrets/pickertime.env`, `life.env`, dsb. Tidak ada satu file global. Skill menunjuk nama scope, bukan nilai. | Pemisahan wewenang yang ditegakkan filesystem, bukan prompt. |
| 1.4 | GitHub: buat **fine-grained PAT** per repo, read-only untuk metadata CI (`Actions: read`, `Checks: read`, `Pull requests: read`), + write hanya `contents`/`pull-requests` kalau kita buka jalur perbaikan (aksi ter tulis di §7). | PAT lama sudah punya sejarah (M5.4 masih BLOCKED: penghapusan via UI belum terjadi) — jangan gandakan. |
| 1.5 | Pasang retensi media chat + batasi ukuran direktori sebelum channel apa pun dibuka. | Yang lebih dulu menghabiskan disk biasanya media/voice note, bukan sesi LLM. |

---

## 4. TAHAP 2 — Provider model untuk otak

- Model utama otak: **satu nama bertanggal** (mis. `gemini-3.1-flash-lite`), alias dilarang —
  konsisten dengan F-69 di jalur mobile.
- Peran berbeda boleh pakai model berbeda: peracik skill → model paling kuat yang tersedia
  gratis; penambang & klasifikasi → model kecil/lokal.
- **Pagar anggaran & kuota (F-72)** dicatat di sisi otak juga: limit free tier berlaku **per
  project, bukan per key**, jadi otak + aplikasi mobile + project pribadimu akan
  **berbagi kuota yang sama** kalau pakai satu project Google. Ini jebakan nyata begitu
  Hermes jadi sentral. Putusan: pakai project Google terpisah untuk otak, atau pakai
  OpenRouter/Groq untuk otak dan Gemini khusus untuk aplikasi.
- Tulis keputusan ini ke `docs/01_architecture/ai_strategy.md` (dok itu masih menyebut Appwrite,
  F-66 — bersihkan sekalian).

---

## 5. TAHAP 3 — Channel

- **Telegram**: bot resmi via long-polling → tidak ada port baru, tidak ada webhook publik,
  tidak menambah permukaan serang. Mulai dari sini.
- Allowlist pengirim (hanya nomormu) dan minta persetujuan untuk pengirim baru — ini
  non-negotiable begitu otak memegang repo dan kredensial.
- **WhatsApp**: ditunda. Kalau nanti dibutuhkan: Baileys (built-in, nomor pribadi, sesi
  persisten, risiko banned) vs Cloud API (resmi, tapi butuh **URL HTTPS publik** untuk webhook
  Meta + aturan jendela 24 jam). Webhook itu akan menumpang tunnel yang tercatat punya
  520 laten ~1/475 — untuk chat itu terasa sebagai "pesan hilang".
- Watchdog **di luar** otak (heartbeat yang tidak lewat Hermes): mode kegagalannya adalah
  "otak mati dan satu-satunya yang akan memberi tahu adalah otak". Preseden di tracker:
  timer backup pernah elapse tanpa start service (P8), dan backup putus diam-diam
  2026-10-03.

---

## 6. TAHAP 4 — Tata letak skill & gerbang indeks

```
~/.hermes/skills/life-…            scope: life        tools: baca+kirim pesan   secrets: none
~/Coding/Pickertime/.hermes/skills/pickertime-…   scope: repo        tools: read-only, gh pr create
~/Coding/<proj>/<...>/                             ← skill ikut repo, di-review lewat PR
ops                                                 ← SENGAJA KOSONG, lihat §7
```

- Nama: `<scope>-<objek>-<kerja>`. Satu skill = satu tingkat wewenang.
- Format SKILL.md (frontmatter + progressive disclosure) kompatibel dengan standar terbuka
  Agent Skills → tidak terkunci ke Hermes; repo ini sudah punya preseden bentuk yang sama di
  `.claude/agents/kfc/`.
- **Gerbang indeks** (F-76): `tools/test/skill-index.mjs` di CI yang menolak — skill tanpa
  field `scope`, deskripsi yang terlalu mirip (tabrakan aktivasi), dan skill yang meminta
  akses shell tanpa `approval: human`. Alasan: loop belajar punya bug yang terdokumentasi
  (#30220) menaruh konten ke kotak yang salah; kalau kotaknya = wewenang, salah kotak itu
  eskalasi hak.
- Skill **lahir sebagai PR**, tidak pernah langsung aktif.

---

## 7. TAHAP 5 — CI/CD: awasi, lapor, dan perbaikan terbatas

Kamu minta: read-only + lapor, tapi boleh mengeksekusi perbaikan bila perlu. Itu bisa
ditepati tanpa membuka jalur inferensi→root, dengan memisahkan **pengamatan** dari
**perbaikan**, dan membatasi perbaikan ke daftar aksi yang reversibel.

| Kelas | Aksi | Mode |
|---|---|---|
| **Amati** | `gh run list/view`, baca log job, bedakan gagal karena `Type-check` vs `Skema/hook` vs `guard-main`, deteksi run deploy tersangkut, laporkan PR yang 3 jam tak dilepas | **read-only, otomatis, kapan pun** — tidak pernah butuh izin khusus |
| **Lapor** | Kirim ringkasan ke Telegram: sha, job, baris log penyebab, temuan F-xx terkait, saran tindakan | **read-only, otomatis** |
| **Perbaiki (allowlist)** | Re-run workflow yang gagal karena flaky/transien; `comment` di PR; buka **PR draft** berisi patch (bukan push ke branch apa pun); jalankan `npx tsc --noEmit` / gate repo di branch terpisah lalu push branch `fix/agent-<id>` | **Boleh otomatis**, karena tidak ada satu pun yang menyentuh `main`/`dev` atau infrastruktur |
| **Perbaiki (butuh kamu)** | Merge PR; **push ke `main`** (deploy backend nyata); `workflow_dispatch apply/rollback`; ubah `pb_migrations`; restart container; `docker` apa pun; apa pun yang menulis dengan PAT `contents:write` ke branch terlindungi | **Selalu butuh persetujuan manusia eksplisit** |

Pagar yang membuatnya nyata, bukan slogan:

1. PAT yang dipegang Hermes tidak punya hak `deployment`/admin repo, dan branch protection
   `main` (`enforce_admins=true`, required checks) tetap menjadi penjaga terakhir — **jangan
   pernah melonggarkannya untuk memudahkan agen**.
2. Perbaikan level infrastruktur **tidak lewat skill Hermes sama sekali**; ia lewat jalur
   Pub/Sub + agen root yang sudah ada hari ini. Alasannya: agen root tidak boleh bisa
   dipanggil oleh sesuatu yang isi keputusannya dihasilkan model.
3. Setiap aksi ditulis ke log append-only (waktu, skill yang aktif, aksi, sha, hasil),
   dan setiap perbaikan wajib menyisakan bukti terukur — mengikuti aturan H1–H9 repo.
4. Kalau suatu aksi tidak bisa dibalik dalam satu perintah, aksi itu bukan bagian dari
   allowlist.

---

## 8. TAHAP 6 — Loop belajar khusus Pickertime

`Pickertime → Workspace_Events → penambang (SQL, nol LLM) → peracik skill (API) → PR → kamu`

Prasyarat (status terukur 2026-10-09):
- ~~`event_type` masih text bebas~~ **TUTUP (T-21)** — migrasi
  `1791526402_workspace_events_ketat.js` memasang `pattern` 5 nilai + `occurred_at` (date,
  tidak wajib) + indeks `idx_events_user_occurred (user, occurred_at)`; backfill dari
  `payload.timestamp` (`dariPayload=2`) dengan fallback ke `created` (`fallbackCreated=1`),
  baris di luar daftar dinormalisasi ke sentinel `UNKNOWN` (`dinormalisasi=1`) dan **tetap
  bisa ditulis**. Terbukti pada `ghcr.io/muchobien/pocketbase:0.40.4` lewat siklus nyata
  seed-skema-lama → migrasi → `migrate down 1` → `migrate up` (7 baris selamat di ketiga
  keadaan; `EXPLAIN QUERY PLAN` memakai indeks baru). Catatan untuk penambang: `UNKNOWN`
  bukan perilaku pengguna, ia artefak migrasi — jangan ikut dihitung sebagai event.
  Kontrak TS↔skema dijaga `npm run test:enum`; penegakan tulis dijaga CI
  (`pb-schema-verify`: nilai haram → HTTP 400).
- `is_processed` tidak pernah di-update siapa pun → jadikan antrean kerja, atau hapus (F-62).
  Sisi skema sudah siap (kolom bisa ditulis tanpa ditolak pattern, lihat di atas); yang belum
  ada adalah pemakai yang menuliskan kembali.
- F-34 (filter hari UTC vs WIB) harus beres lebih dulu, atau kebiasaan yang ditambang salah.
  `occurred_at` menyimpan UTC apa adanya; ia mempermudah F-34 tapi tidak menutupnya.

Untuk "otak ikut berpikir tentang aplikasi", pilihan bentuk yang kurekomendasikan (§9/F-78):
otak menulis **rencana/insight ke tabel PocketBase** pada jadwal malam; app membacanya;
hook online tetap cepat dan deterministik.

---

## 9. Larangan keras (dijaga oleh CI kalau bisa)

1. Tidak ada skill yang menjalankan perintah sebagai root, dan tidak ada skill yang memanggil
   jalur deploy Pub/Sub.
2. Tidak ada agen yang me-merge PR-nya sendiri, `git push` ke `main`, atau mengubah branch
   protection.
3. Tidak ada kredensial di dalam skill/memory/chat. WhatsApp & Telegram = antarmuka, bukan
   brankas.
4. Tidak ada `--latest`/alias model di mana pun.
5. Tidak ada perubahan VM yang dilakukan sebelum **TAHAP 0** terukur.

---

## 10. Tanggung jawab

**Hanya kamu (butuh akses VM/GCP/console):** TAHAP 0 semua; bikin & rotate PAT fine-grained;
putuskan project Google mana untuk otak (F-72); approve PR skill; buka channel WhatsApp nanti.

**Bisa aku kerjakan di repo:** gerbang `skill-index.mjs` + template frontmatter; skrip
`tools/agent/preflight-agent.sh` yang mengumpulkan semua perintah TAHAP 0 jadi satu laporan;
migrasi `event_type`/`occurred_at` + indeks; penambang lapis 1 sebagai `.mjs` teruji;
patch `pb_hooks` (F-69, F-71–F-74); dokumentasi `ai_strategy.md` yang dibersihkan.

**Urutan yang kuusulkan:** TAHAP 0 (kamu, 10 menit) → aku rapikan angkanya ke dokumen ini →
TAHAP 1.1–1.2 (isolasi, kamu) → TAHAP 5 kelas "Amati/Lapor" (nilai tercepat, risiko nol, tidak
perlu Ollama/channel apa pun) → TAHAP 4 + 6.
