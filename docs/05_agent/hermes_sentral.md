# Hermes sebagai sentral — topologi, guardrail, dan tahap persiapan

Dihasilkan dari sesi 2026-10-08. **TAHAP 0 SELESAI**: formasinya terukur 2026-10-08 (F-75), dan
**2026-10-10** butir §2.3/§2.4 yang waktu itu belum punya angka ikut terukur (§2.5) — kedua syarat
"selesai kalau" di §2 kini punya kutipan angka, jadi tidak ada lagi perubahan VM yang menunggu
baseline. Dokumen ini tetap berkas kerja karena keputusan pemilik masih menunggu di §0/§9 dan Fase 1
lanjutan masih terbuka; satu temuan baru lahir dari pengukuran 2026-10-10 itu (**F-82**).
Register temuan + bukti lengkap pindah ke repo infra:
`config-agentic/docs/12-fase-1-dasar.md` (angka + bukti) dan `docs/11` repo itu
(register CFG-01…**CFG-34**), branch `docs/fase-hermes-sentral`, commit HEAD `1329010`
(sebelumnya dokumen ini menyebut `65d9395` + "CFG-01…CFG-27" — dua-duanya sudah basi; terukur
2026-10-10 register berhenti di CFG-33 sebelum F-82, dan `1329010` = commit tip branch itu).

Terkait: `docs/04_audit/action_plan_2026-10-08.md`. Penomoran bersama (terukur 2026-10-09 di kedua
repo): rencana audit itu berhenti di **F-74** dan menambahkan **F-79/F-80** pada gelombang kalender
2026-10-09 (semula dicatat F-75/F-76, dinomori ulang karena sudah dipakai di bawah), sehingga
**F-75/F-76/F-78** adalah nomor dokumen ini — F-75 = ukur VM (CFG-01), F-76 = gerbang indeks skill
(CFG-16), F-78 = bentuk kontribusi otak ke aplikasi.
**Koreksi penomoran 2026-10-10**: kalimat "berhenti di F-74" itu sudah tidak benar — **F-81** sudah
terpakai untuk balap limiter 429 (`TODO.md:1159`, `action_plan:205`), dan nomor yang dipakai dari
pengukuran TAHAP 0 hari ini adalah **F-82** (= `CFG-34` di register infra). Jadi milik dokumen ini:
F-75, F-76, F-78, F-82.

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

## 2. TAHAP 0 — Pengukuran & baseline compat (SELESAI: F-75 2026-10-08 + §2.5 2026-10-10)

Sampai tahap ini selesai, tidak ada satu pun perubahan di VM yang aman untuk dijadwalkan.
Kondisi itu sekarang terbalik: jadwal sudah boleh disusun karena angkanya ada — tapi satu pengukuran
(§2.5) melahirkan **F-82**, yang justru menahan klaim "sudah terisolasi" di Fase 1.1.

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
`free -h` masih menyisakan ≥1 GB setelah semua yang ada sekarang jalan. → **terjawab**: §2.5 mencatat
seluruh butir dan available `1812–1850 MB` pada 2026-10-10.

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

### F-82 — terukur 2026-10-10: isolasi host tidak ditegakkan di user login

F-75 menutup pertanyaan "apakah Hermes jalan sebagai root" untuk **di dalam** kontainer (`uid=1000(hermes)`,
tanpa grup docker, tanpa `docker.sock`). Pengulangan pengukuran 2026-10-10 membaca sisi **host**:

```
uid=1001(arkan) gid=1004(arkan) groups=1004(arkan),4(adm),30(dip),44(video),46(plugdev),
                    1000(google-sudoers),1001(docker),1002(lxd)
$ sudo -n -l
User arkan may run the following commands on hermes-openclaw-vm:
    (ALL : ALL) NOPASSWD: ALL
```

Dua fakta itu together berarti proses mana pun yang jalan sebagai `arkan` — sistem mirror `rsync`
(CFG-14/CFG-26/T-17), berkas sumber healthcheck yang dia tulis (CFG-30), repo `~/openclaw-docker`
yang terbukti dia tulis (CFG-06), dan agen apa pun yang memakai `sudo -n` karena tidak ada prompt
password — adalah **root di box produksi** tanpa perlu menyentuh `docker.sock`. Implikasinya ke
§2(c): kalimat "syarat isolate sebelum channel dibuka sudah terpenuhi di sisi proses, jadi TAHAP 1.1
praktis selesai" **hanya benar untuk uid di dalam kontainer `hermes`**. Yang benar:

- syarat §1.2 ("user `hermes` tidak bisa membaca env PocketBase / tidak bisa publish topic") tetap
  terpenuhi di kontainer — itu tidak dikoreksi oleh pengukuran ini;
- yang belum terpenuhi adalah **lapisan host**: selama user login memegang `NOPASSWD: ALL` + grup
  `docker`, segala jalur "isolasi" yang dibangun di atas user tersebut bisa dinaikkan ke root oleh
  satu baris perintah tanpa jejak interaktif.

Perbaikan yang koheren dengan pola itu bukan memindahkan Hermes (sudah non-root), tapi **menutup
sudo NOPASSWD untuk user login** dan mengeluarkan `arkan` dari grup `docker`, lalu membiarkan hanya
unit root yang mengurus kontainer. Sisi "apa yang putus" sudah dipercuji lebih dulu, semuanya read-only:
**tidak ada satu pun konsumen `sudo`** di jalur yang hidup — `grep -c sudo` = `0` pada
`/opt/pickertime/pickertime-pb-agent.sh` dan `/opt/pickertime/pickertime-pb-backup.sh`,
`sudo grep -l sudo /etc/systemd/system/*.service *.timer` = kosong, dan `0` pada kedua salinan wrapper
mirror (`~/.local/bin/vm-repo-sync.sh` di laptop + `scripts/vm-repo-sync.sh` di repo — isinya
`exec /home/arkan/google-cloud-sdk/bin/gcloud compute ssh …`). Jadi cabut NOPASSWD tidak memutus agen
deploy, backup, maupun mirror. Satu nuansa yang justru menolong: `/home/arkan/.local/bin` di VM
ternyata `root:root 755` (isinya hanya biner `agy` 224 MB milik `node`) → user login tidak bisa
menulis PATH-nya sendiri di VM. Aksi tulis ini tetap keputusan + tangan pemilik.
Nomornya di register infra: **CFG-34**.

### 2.5 Angka yang tersisa — terukur 2026-10-10 lewat `gcloud` + IAP SSH (semua read-only)

Bentuk mesin, dibaca ulang pada hari yang sama dengan F-82:

| Aspek | 2026-10-08 | 2026-10-10 |
|---|---|---|
| Waktu hidup | start `2026-10-05 04:06` | `uptime -s = 2026-10-05 04:06:05`, `up 4 days, 20:57`, load `0.01 0.05 0.07`, `nproc = 2` |
| RAM | total 3924 MB, available **1683 MB**, swap terpakai 106 MB | total 3924 MB, used 2073→2112 MB, available **1850 MB → 1812 MB** (dua sampel), swap terpakai **268 MB** |
| Disk | 34 GB terpakai / **61 GB sisa (37%)** | 35 GB terpakai / **60 GB sisa (37%)**; `df -h /` dan `df -h /var/lib/docker` = perangkat yang sama (`/dev/sda1`, 99 G) |
| OS | tidak dicatat | **Debian GNU/Linux 12 (bookworm)**, kernel `6.1.0-53-cloud-amd64` |

Syarat "selesai kalau" yang kedua terjawab di baris RAM: **available masih ≥ 1 GB** dengan semua yang
ada sekarang jalan (dua sampel: 1850 MB dan 1812 MB).

**Versi = kunci compat** (§2.3, ini yang bikin rencana Fase 2 bisa dipesan lebih dulu):

| Tempat | Terukur |
|---|---|
| Host | `hermes` → **command not found**, `node` → **command not found**, `cloudflared` → **command not found**; `git 2.39.5`, `rsync 3.2.7 (protocol 32)`, `python3 3.11.2` |
| Kontainer `hermes` | **Hermes Agent v0.21.3 (2026.9.14) · upstream b1858f33**, install dir `/opt/hermes`, metode `docker`; node **v26.5.1**; gateway = pid 197 `exe=/usr/bin/python3.13`; layanan s6 aktif: `dashboard, gateway-default, main-hermes, s6-linux-init-shutdownd, s6rc-fdholder, s6rc-oneshot-runner` |
| Kontainer `openclaw-gateway` / `webhook-proxy` | node **v25.9.0** (image `openclaw:local-node25`) |
| Kontainer `pickertime-pocketbase` | **pocketbase version 0.40.4**, biner di **`/usr/local/bin/pocketbase`**; `user=` (root), `StartedAt 2026-10-07T13:28:35Z`, **`restarts=0`** → invarian M8.1 tidak tersentuh sejak 2026-10-07 |
| Kontainer `cloudflared` + `pickertime-cloudflared` | **cloudflared 2026.9.1 (built 2026-09-11-13:48 UTC)** |
| Kontainer `litellm-proxy` | litellm **1.103.0** (`pip` tidak ada di PATH; yang bicara `importlib.metadata`) |
| Kontainer `openclaw-docs` | **nginx 1.31.6** |

Digest image yang jalan hari ini — persis bahan yang dibutuhkan T-08 untuk memasang pin (CFG-25):
`hermes:local 1353556275cc` · `openclaw:local-node25 713d689ae2f0` ·
`muchobien/pocketbase:0.40.4 9390b7b63ce1` (sudah dipin) · `cloudflare/cloudflared:latest b269e8abd07a` ·
`berriai/litellm:main-latest 52abe19ecef0` · `gemini-agent:latest a2f83e106473` ·
`chromadb/chroma:latest 1e0b73a187a2` · `nginx:alpine df221db836e1`.

Konsumsi per kontainer (`docker stats --no-stream`), dipakai untuk menagih CFG-23:
`openclaw-gateway 744,7 MiB` · `hermes 357,8 MiB / 2 GiB` · `litellm-proxy 307 MiB` ·
`cloudflared 56,7 MiB` · `pickertime-cloudflared 25,5 MiB` · `pickertime-pocketbase 31,6 MiB` ·
`webhook-proxy 24,2 MiB` · `chromadb 11,2 MiB` · `openclaw-docs 3,8 MiB` · `gemini-agent 512 KiB`.
Batasnya **masih 2 dari 10** (`hermes` 2 GiB / 1,5 CPU = 1500000000 nano, `gemini-agent` 1 GiB / 0,5 CPU),
delapan sisanya `mem=0 nanocpu=0` — konfirmasi ketiga CFG-23, belum ada satu limit pun terpasang.

Service dan timer (§2.3 "daftar service yang jalan"): **43** unit `active` di host, dan hanya tiga yang
cocok kata kunci `pocketbase|hermes|cloudflared|backup|relay|openclaw|agent`, ketiganya milik Google/LSB:
`exim4`, `google-guest-agent-manager`, `google-osconfig-agent`. Tidak ada service PocketBase/Hermes di
host → penegasan CFG-28 (kotak PocketBase tidak dikelola unit apa pun). Yang benar-benar berdenyut di
host adalah timer: `gog-watchdog.timer` (last `2026-10-10 01:04:56`, next `01:06:56` = **60 detik**),
`pickertime-pb-agent.timer` (last `01:05:57`, next `01:06:57` = **60 detik**), `pickertime-pb-backup.timer`
(last `Fri 2026-10-09 03:22:53`, next `Sat 2026-10-10 03:23:03` = harian).
Unit **user** tidak terbaca dari sesi IAP: `systemctl --user list-units` → kosong, dan versi
`sudo XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus systemctl --user …`
→ **`Failed to connect to bus: Operation not permitted`** (userns/`RemoveIPC`). Jadi klaim tentang
`repo-sync.service`/`.timer` (T-17) harus tetap diambil dari berkas unit + `logs/repo-sync.log`, bukan
dari `systemctl --user` lewat SSH.

Inbound/outbound (§2.4): `ss -tlnp` hari ini — `0.0.0.0:22`, `0.0.0.0:5355`, **`0.0.0.0:8888`**
(dan `[::]:22`, `[::]:5355`, `[::]:8888`), loopback `127.0.0.1:{25,4000,8788,8789,18000,18789}`,
`127.0.0.53%lo:53`, `127.0.0.54:53`. Dua telinga baru dibanding CFG-22 (`22` dan `5355`), dan
**8888 masih `0.0.0.0`** pada 2026-10-10 — perbaikan `127.0.0.1:8888:80` memang benar belum pernah
turun ke VM (CFG-33). `cloudflared tunnel list` (dari dalam kontainer `cloudflared`, yang memegang
kredensial CF): **2 tunnel** — `arkan-server` `699603e0-…` dibuat `2026-03-01T04:26:28Z` dengan
**0 koneksi**, dan `openclaw-webhook` `86eb0217-…` dibuat `2026-08-26T14:50:54Z` dengan
`1xcgk01, 1xcgk07, 2xord11, 2xord15, 1xsin07, 1xsin15`. Yang pertama itu kandidat "nama tanpa isi"
untuk Fase 3.

Skill (§2.3): `/opt/data/skills` di kontainer `hermes` = **82** `SKILL.md` dalam **15** kategori —
`apple, autonomous-ai-agents, creative, devops, email, github, media, mlops, note-taking, productivity,
research, smart-home, social-media, software-development, web`. Host `~/.hermes` **tidak bisa dibaca
user login**: `ls -A ~/.hermes` → `Permission denied` (mode/kepemilikan hasil CFG-06), dan
`find ~/.hermes/skills -name SKILL.md | wc -l` = **0**. Artinya satu-satunya inventori skill yang bisa
dijaring gerbang ada **di dalam kontainer**, sedangkan gerbang CFG-16/T-19 hanya memindai repo —
celah yang sudah dicatat di T-19 kini punya angka pendukung.

### 2.6 Bentuk perintah yang benar (koreksi daftar §2 supaya sesi berikutnya tidak mengulang gagalku)

Daftar §2 di atas ditulis seolah semuanya perintah host; terukur hari ini sebagian bukan:

| Butir §2 | Perintah yang benar di box ini |
|---|---|
| `hermes --version \|\| which hermes` | `docker exec hermes /opt/hermes/bin/hermes --version` (host: tidak ada biner; `sh -lc "hermes --version"` juga gagal karena PATH login shell kontainer tidak memuatnya) |
| `node -v` | per kontainer: `docker exec hermes node -v` = v26.5.1, `docker exec openclaw-gateway node -v` = v25.9.0; host tidak punya node |
| `ls -la ~/.hermes/` | `docker exec hermes ls -la /opt/data` (host menolak `arkan`) |
| PocketBase version | `docker exec pickertime-pocketbase /usr/local/bin/pocketbase --version` — **bukan** `/pocketbase` (probe itu `stat /pocketbase: no such file`) |
| `cloudflared --version; cloudflared tunnel list` | `docker exec cloudflared cloudflared …` (di host tidak ada biner; kredensial CF ada di dalam kontainer, bukan di host) |
| `systemctl list-units … \| grep -Ei "pocketbase\|hermes…"` | tambah `--state=active` (bukan `running`) dan baca `systemctl list-timers --all`: beban nyata di host ada di timer 60 detik, bukan service |
| `sudo -n -l` | jalan, dan jawabannya justru temuan F-82/CFG-34 |

**Status TAHAP 0: SELESAI.** Kedua syarat §2 terukur — seluruh butir §2.1–§2.4 punya angka (F-75
2026-10-08 + §2.5 2026-10-10), dan `free -m` menyisakan **1812–1850 MB available** (> 1 GB) dengan
sepuluh kontainer yang ada sekarang jalan. Yang **tidak** selesai karena pengukuran ini, dan tetap
butuh tangan/keputusan pemilik: `CFG-20` (Opsi A), `CFG-23` (8 kontainer tanpa limit), `CFG-30/31/32`
→ T-29/T-28, `CFG-33` → T-30, `CFG-34`/F-82 (sudo NOPASSWD + grup docker), dan rotasi
`GEMINI_API_KEY` yang bocor (`TODO.md` M21/M22).

### 2.7 Empat hal yang muncul di luar daftar §2 (terukur, satu dikoreksi sendiri, dan berakhir dengan timer ditahan)

**(a) Mesin yang salah kucari.** Daftar §2 menulis perkakas mirror seolah bagian dari inventaris VM.
Terukur hari ini di VM: `ls ~/.local/bin/vm-repo-sync.sh` → **No such file or directory**,
`ls ~/.config/systemd/user` → **No such file or directory**, dan
`sudo find /home/arkan -maxdepth 4 -name "vm-repo-sync*"` → **kosong**. Ketiganya ada di **laptop**:
wrapper `~/.local/bin/vm-repo-sync.sh` **348 byte**, mtime `Oct 8 19:49`, isinya `set -euo pipefail` +
`exec /home/arkan/google-cloud-sdk/bin/gcloud compute ssh … -- "$@"`; unit
`~/.config/systemd/user/repo-sync.service` **162 byte** dan `.timer` **158 byte**, mtime `Sep 30 11:11`;
`systemctl --user is-active repo-sync.timer` → **active**. Jadi jalur mirror hidup di sisi "tangan"
(PC kerja), persis pemisahan otak/tangan §1 — dan angka CFG-26/T-04/T-18 selama ini adalah angka
laptop. Catatan alat: ini menjelaskan kenapa `systemctl --user` lewat IAP kosong (§2.5) — unitnya memang
tidak ada di VM, bukan bus yang menolak saja.

**(b) Run 2026-10-10 01:10 WIB benar-benar terjadi, dan jaring penghapusnya tertagih.**
`repo-sync.timer`: LAST `Sat 2026-10-10 01:10:00 WIB`, NEXT `Sun 2026-10-11 01:10:00 WIB`.
Blok terakhir `logs/repo-sync.log` (laptop): `sent 355.577.714 bytes`, `received 299.601`,
`total size is 9.309.980.498`. Di VM, `--backup` hasil T-18 memindahkan **503 berkas** ke
`/home/arkan/backups/mirror/20261009T181000Z` (**140.179.961 byte**; `du -sh /home/arkan/backups/mirror`
= **136M**): `find -type f -not -path "*/.git/*"` = **120**, sisanya **383** di dalam `.git/`;
yang 120 itu **52** di bawah `Sekawan_Media_Tasks/asw` (43 di antaranya `asw/research`), **27**
`Pickertime/`, **11** `Sekawan_Media_Tasks/inafood`, **19** `website-porto2/` + 11 sisanya tersebar.

**(c) Koreksi terhadap kalimatku sendiri di (b), dan ini yang penting.** `--backup-dir` menampung berkas
yang **dihapus DAN yang ditimpa** — persis seperti ditulis di komentar skripnya — jadi 503 itu **bukan**
jumlah penghapusan. Setelah dipilah per berkas (sambutan `ADA/TIADA` + `md5sum` di working tree vs
backup-dir): dari **43** berkas non-`.git` `asw/research`, **28 masih ada dengan isi berbeda** (=
ditimpa versi laptop; mis. `modules/rnd/views/mainview.php` working `b0004d52…` vs backup `e5b34f40…`)
dan **15 benar-benar hilang** (mis. `sql/index_optimasi_trial_bahan_baku_new.sql` → TIADA). Artinya
prediksi dry-run T-18 **"15 berkas `asw/research`" itu TEPAT**; yang salah adalah aku membaca 503 sebagai
penghapusan (6,3× meleset) — kesalahan kelas H1, angkaku benar sumbernya tapi salah tafsir alatnya.
Yang nyata rusak: **15 berkas hilang** (semuanya untracked di git VM, jadi tidak bisa dipulihkan dari
repo) + **28 berkas kerja VM ditimpa versi laptop** + **383 berkas `.git/` bergerak** — dan itu
bukti berjalan untuk **CFG-33/T-30**: mirror satu arah tiap malam mengembalikan drift dua arah.
Pilahan menyeluruh atas 503 itu (read-only, `cmp` per berkas terhadap working tree VM, `PROCESSED=120`
mencocokkan cacah `find`): di luar `.git/` = **99 ditimpa**, **16 terhapus** (15 `asw/research` +
1 `Pickertime/components/__tests__/StyledText-test.js` — persis berkas jest yatim yang dihapus F-55 di
laptop, jadi penghapusannya baru menyeberang malam itu; `components/ExternalLink.tsx` ikut tercatat di
jaring sebagai **ditimpa**, bukan dihapus, mtime laptop `Oct 7 20:34`), **5 identik**; di dalam `.git/`
= **136 ditimpa** + **247 tiada di tujuan** (objek repack yang memang
dibuang, bukan kerja pengguna). Dari 43 `asw/research`: yang **28 ditimpa semuanya tracked**
(`git ls-files --error-unmatch` → ada, jadi HEAD `2868970` bisa jadi pembanding), yang **15 terhapus
semuanya untracked** → `git status` tidak pernah bisa melaporkan mereka, dan satu-satunya salinan yang
tersisa ada di backup-dir.
Sisa kerusakan terukur: `asw/research` HEAD `2868970` (2026-10-09 10:40 +0700) utuh,
`git ls-files` = **15.772**, `git status --porcelain` = **37** entri `" D"` + **2** `"??"`,
`staged deletion = 0`, `modules/rnd/views` masih **301** berkas; `website-porto2` HEAD `c817d98`
dengan **0** penghapusan tracked. Ketiga puluh tujuh `" D"` itu **bukan** kerja run tadi malam, dan
sekarang terukur kenapa: `/home/arkan/backups/mirror/` hanya punya **satu** stamp
(`20261009T181000Z` = run 2026-10-10 01:10 WIB; jaring baru berdiri 2026-10-08), sementara
`assets/jstree/dist/jstree.js`, `assets/global/plugins/jstree/dist/jstree.js`, dan
`vendor/paragonie/random_compat/dist/random_compat.phar.pubkey` → **TIDAKDIJARING**, dan ketiganya juga
**tidak ada di laptop** (`ls` → No such file). Artinya berkas vendored/hasil build yang cuma hidup di VM:
sudah dibuang oleh run-run **sebelum** jaring terpasang, dan akan dibuang lagi tiap run sampai T-31
memasang exclude. `git checkout -- <path>` memulihkannya, tapi itu tambal sementara, bukan penyelesaian.

**(d) Aksi yang diambil (keputusan pemilik: "tahan timer, jangan sentuh VM").**
`systemctl --user stop repo-sync.timer` → `rc=0`, `is-active=inactive`, `list-timers | grep -c repo-sync`
= **0**. Lalu `disable` atas persetujuan pemilik karena dua hal terukur: `Persistent=true` +
`OnCalendar=*-*-* 01:10:00` + `UnitFileState=enabled` artinya **boot/login berikutnya menyalakan run
catch-up seketika** — penahanan yang tidak di-disable bisa lepas sendiri, dan "start lagi" setelah jam
01:10 juga memicu run **langsung**. Terukur: `Removed …/timers.target.wants/repo-sync.timer`,
`UnitFileState=disabled`. Re-arm yang sadar = `systemctl --user enable --now repo-sync.timer` **setelah**
T-30/T-31 diputuskan. **Tidak ada satu pun tulis ke VM** yang kukerjakan. Yang menunggu pemilik,
dengan tiga kelas berbeda: **15 berkas `asw/research` terhapus** — untracked di git VM, jadi satu-satunya
salinan tersisa ada di `/home/arkan/backups/mirror/20261009T181000Z/Sekawan_Media_Tasks/asw/research/…`
(salin kembali ke jalur aslinya); **28 berkas tracked yang isinya ditimpa versi laptop** — PUTUSAN, bukan
pemulihan, karena HEAD `2868970` dan cadangan jaring adalah dua kandidat yang berbeda (versi VM ada di
backup-dir, versi git pulih dengan `git checkout -- <path>`); dan **37 entri `" D"`** yang sudah
terukur asalnya di (c) — berkas vendored yang hilang sebelum jaring ada, dipulihkan dengan
`git checkout -- <path>` tapi akan dibuang lagi sampai T-31. Satu penghapusan **jangan** dipulihkan:
`Pickertime/components/__tests__/StyledText-test.js` — itu memang
kerja F-55/T-22 di laptop yang akhirnya menyeberang.

Satu koreksi alat dari (a): `repo-sync.service` ExecStart = `/home/arkan/openclaw-docker/scripts/vm-repo-sync.sh`
(tercatat di git `28ea24c`) yang memakai `-e /home/arkan/.local/bin/vm-repo-sync.sh` sebagai **transport
SSH** — dua berkas, dua peran, dan `|| true` yang masih terbuka (CFG-26) ada di **skrip sync**, bukan di
transport. Isinya terukur: `rsync -a --delete --backup --backup-dir=… --info=stats2 --partial` dengan
`flock -n /tmp/vm-repo-sync.lock`, log ke `logs/repo-sync.log`, filter `--include` untuk
`.env.example`/`.env.sample` sebelum `--exclude='.env*'` + `pb_data/`, dan `.git/` **sengaja tidak**
di-exclude.


---

## 3. TAHAP 1 — Akun, isolasi, kredensial

| ID | Pekerjaan | Kenapa |
|---|---|---|
| 1.1 | Kalau Hermes saat ini jalan sebagai **root**, pindahkan ke service user `hermes` (non-root, `systemd --user` atau unit dengan `User=hermes`). | Ini satu-satunya perubahan yang membuat "jadi sentral" aman. Tanpa ini, skill yang salah = root di box produksi. |
| 1.2 | Pastikan user `hermes` **tidak bisa membaca** file env PocketBase (`PB_ADMIN_PASSWORD`, `superuser.txt`) dan tidak bisa publish/subscribe topic Pub/Sub deploy. Cek dengan `sudo -u hermes cat <path>` → harus `Permission denied`. | `deploy.yml:5-11` menyatakan kredensial superuser tidak pernah keluar dari VM; jangan buat agen yang menulis kode sendiri ikut memegangnya. |
| 1.3 | **Satu secret scope per konteks**: `~/.hermes/secrets/pickertime.env`, `life.env`, dsb. Tidak ada satu file global. Skill menunjuk nama scope, bukan nilai. | Pemisahan wewenang yang ditegakkan filesystem, bukan prompt. |
| 1.4 | GitHub: buat **fine-grained PAT** per repo, read-only untuk metadata CI (`Actions: read`, `Checks: read`, `Pull requests: read`), + write hanya `contents`/`pull-requests` kalau kita buka jalur perbaikan (aksi ter tulis di §7). | PAT lama sudah punya sejarah (M5.4 masih BLOCKED: penghapusan via UI belum terjadi) — jangan gandakan. |
| 1.5 | Pasang retensi media chat + batasi ukuran direktori sebelum channel apa pun dibuka. | Yang lebih dulu menghabiskan disk biasanya media/voice note, bukan sesi LLM. |
| 1.6 | **(baru, dari F-82/CFG-34)** Tutup `NOPASSWD: ALL` untuk user login dan keluarkan `arkan` dari grup `docker`; biarkan hanya unit root yang mengurus kontainer. | Selama dua itu ada, "isolate sebelum channel dibuka" bisa dinaikkan ke root host oleh satu baris perintah — termasuk oleh skill yang lahir dari loop belajar (§6) yang jalan sebagai `arkan`. Pra-uji sudah dikerjakan (§2, F-82): nol konsumen `sudo` di jalur hidup, jadi cabutnya tidak memutus agen deploy/backup/mirror. |

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
