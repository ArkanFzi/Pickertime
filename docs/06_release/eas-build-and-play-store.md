# EAS Build produksi & submit Play Store

Status per 2026-11-12:

- **Build produksi terbukti** dua kali: P6 (2026-10-04, versionCode 2) dan C5
  (2026-11-12, versionCode **3** dengan `appVersionSource: remote`), keduanya
  AAB 71 MB, keystore remote EAS `rm9SIrYQd2`.
- **M4.4 (job CI) siap, BLOCKED-user**: butuh repository secret `EAS_TOKEN`.
- **M4.5 (submit Play) siap, BLOCKED-user**: butuh service account Play Console.
- **M4.6 smoke pasca-deploy** sudah DONE (lihat `TODO.md`).

Artinya: seluruh konfigurasi dan workflow sudah ada di repo; yang tersisa
hanya dua kredensial milik pemilik akun. Tidak ada langkah lain yang bisa
diotomatiskan dari sisi kode.

---

## 1. Yang sudah disiapkan

### `eas.json`

- `cli.appVersionSource` → **`remote`**. Sebelumnya `local`, dan itu tidak
  cocok untuk CI: `autoIncrement` lokal hanya menaikkan `android.versionCode`
  di build worker tanpa pernah menulis balik ke repo, sehingga build kedua
  dari commit yang sama akan memakai versionCode yang sama dan ditolak Play.
  Dengan `remote`, EAS menyimpan dan menaikkan versionCode di server.
- `submit.production.android`:
  - `serviceAccountKeyPath: ./secrets/play-service-account.json`
  - `track: internal` (bukan production — uji dulu di internal testing)
  - `releaseStatus: draft` (tidak langsung terbit)
- `secrets/` masuk `.gitignore`.

Inisialisasi versionCode remote: build pertama mengambil nilai
`android.versionCode` di `app.json` (saat itu **2**) lalu menaikkannya menjadi
**3**. Nilai `android.versionCode` sudah dihapus dari `app.json` supaya tidak
ada dua sumber kebenaran; EAS memperingatkan nilai lokal diabaikan saat
`appVersionSource: remote`. Build berikutnya naik 4, 5, dst. tanpa perlu commit.

### `.github/workflows/eas-build.yml`

- Trigger: push ke `main` yang menyentuh file aplikasi, atau `workflow_dispatch`.
- `credential-gate` membaca `EAS_TOKEN` / `PLAY_SERVICE_ACCOUNT_JSON` dan
  menulis boolean ke output. Tanpa secret, build **dilewati** dengan notice,
  workflow tetap hijau — kegagalan kredensial tidak menyamar sebagai kegagalan
  kode.
- Build memakai `npx eas-cli@24.8.0` (versi yang sama dengan P6) dan
  `--non-interactive`.
- Submit hanya jika `workflow_dispatch` + `submit=true` + secret Play ada.
- Service account ditulis ke `secrets/` di runner lalu dihapus di step
  `always()`.

---

## 2. Yang harus dilakukan pemilik (sekali)

### 2a. `EAS_TOKEN` → M4.4

1. Buka <https://expo.dev/settings/access-tokens> (login `fzi2`).
2. **Create token**, beri nama mis. `github-pickertime-build`, scope ke akun
   `fzi2` / project Pickertime. Copy nilainya (hanya tampil sekali).
3. Simpan sebagai repository secret:

```bash
gh secret set EAS_TOKEN -R ArkanFzi/Pickertime
# tempel token saat diminta
```

4. Verifikasi:

```bash
gh secret list -R ArkanFzi/Pickertime      # harus memuat EAS_TOKEN
gh workflow run "EAS Build (production)" -R ArkanFzi/Pickertime
gh run watch -R ArkanFzi/Pickertime
```

Build pertama akan memakai versionCode **3**. Artefak AAB muncul di halaman
build Expo dan di ringkasan run.

### 2b. Service account Play → M4.5

1. **Buat app di Play Console** (kalau belum): package
   `my.id.elarisnoir.pickertime`, nama Pickertime. Diperlukan akun developer
   Play Console (biaya sekali).
2. **Google Cloud**: buat project (boleh project yang sama dengan backend),
   aktifkan **Google Play Android Developer API**.
3. **Service account** baru (mis. `pickertime-play-submit`), buat key JSON,
   unduh.
4. **Play Console → Users and permissions → Invite new users**: masukkan email
   service account, beri akses **Release manager** (atau Admin) untuk app ini.
5. Simpan key **hanya** di dua tempat:
   - lokal: `secrets/play-service-account.json` (mode 600, sudah di-ignore), dan
   - GitHub Actions secret:

```bash
gh secret set PLAY_SERVICE_ACCOUNT_JSON -R ArkanFzi/Pickertime < secrets/play-service-account.json
```

6. Submit pertama (manual, dari laptop — tidak menunggu CI):

```bash
npx eas-cli@24.8.0 submit --platform android --profile production
# atau sekaligus: npx eas-cli@24.8.0 build -p android --profile production --auto-submit
```

7. Setelah teruji di internal track, naikkan `submit.production.android.track`
   ke `beta`/`production` dan `releaseStatus` ke `completed` bila sudah siap.

> Jangan pernah commit key JSON. `.gitignore` sudah menutup `secrets/`, dan
> workflow CI menulis key dari secret ke direktori itu hanya selama build.

---

## 3. Store listing — checklist

Aset & isian yang dibutuhkan Play Console (semua disimpan di luar repo kecuali
ikon di bawah):

| Item | Syarat | Status |
|---|---|---|
| Ikon aplikasi | PNG 512×512, 32-bit + alpha, ≤1 MB | **tersedia**: `assets/store/icon-512.png` (turunan `assets/images/icon.png`) |
| Feature graphic | PNG/JPEG 1024×500, tanpa alpha | **belum** — perlu desain pemilik |
| Screenshot ponsel | minimal 2, rasio 16:9–9:16, sisi 320–3840 px | **belum** — ambil dari build produksi |
| Short description | ≤ 80 karakter | draft di bawah |
| Full description | ≤ 4000 karakter | draft di bawah |
| Privacy policy | URL publik (wajib karena app memakai AI & notifikasi) | **belum** — perlu halaman publik |
| Data safety | form Play Console (data dikirim/diproses) | **belum** — isi saat submit |
| Content rating | kuesioner Play Console | **belum** |
| Kategori & tag | Productivity | draft |

### Draft metadata

- **App name**: `Pickertime`
- **Short description (≤80)**: `Rencanakan fokus, atur alarm, dan capai target harian.`
- **Full description** (draft, ringkas):

```text
Pickertime adalah pelacak produktivitas dan alarm pintar untuk harimu.

Rencanakan tugas dengan durasi dan prioritas, lalu jalankan sesi fokus.
Pickertime mencatat sesi, mengingatkan jadwal lewat alarm, dan merangkum
progres harian supaya kamu tahu ke mana waktumu pergi.

Fitur utama:
• Rencana tugas dengan durasi, prioritas, dan alarm
• Sesi fokus dengan log waktu
• Ringkasan progres dan kebiasaan harian
• Mode gelap, cepat, dan hemat baterai

Data disimpan di backend pribadi dan hanya dapat diakses oleh pemilik akun.
```

- **Kategori**: Productivity
- **Bahasa utama**: Indonesia (en-US opsional nanti)

> Catatan: app memakai Gemini untuk fitur AI. Saat mengisi **Data safety**,
> deklarasikan teks yang dikirim ke penyedia AI dan pastikan privacy policy
> menjelaskannya. Jangan menyalin klaim privasi dari template tanpa dicek.

---

## 4. Verifikasi & rollback

```bash
# daftar build produksi
npx eas-cli@24.8.0 build:list --platform android --limit 5

# detail build terakhir
npx eas-cli@24.8.0 build:view

# submit ulang artefak tertentu ke internal
npx eas-cli@24.8.0 submit --platform android --profile production --id <build-id>
```

- VersionCode tidak bisa dipakai ulang. Kalau upload gagal, jangan mengulang
  versionCode yang sama; build baru akan menaikkannya otomatis (remote source).
- Rollback store: Play Console → Release → Internal testing → hentikan rollout
  atau unggah build dengan versionCode lebih tinggi dari commit stabil.
- Rollback repo: `git revert` pada commit yang mengubah `eas.json`/workflow;
  build lama tetap ada di Expo.

## 5. Bukti yang sudah ada

| Hal | Nilai |
|---|---|
| Build P6 | `0ab3142e-0ea8-4909-bde7-e88d9ce5e74b` (2026-10-04) |
| Artefak P6 | `lKTEhzcBgYtQBy_tGv7LdWFBSq_lmnvXt4vHjLdZr_8.aab`, 71 MB |
| Build C5 (2026-11-12) | `c6fed646-9a13-441d-9251-1767e5f27bfe`, profil `production`, commit `5787b0a` |
| Artefak C5 | `nR-fPGOfFlIYzEE4kDfCLWbglRuxs5ZIVASezCW6Ui4.aab`, 71 MB, Zip valid |
| versionCode C5 | **3** (remote; log: "Incrementing versionCode from 2 to 3") |
| Verifikasi C5 | `base/assets/index.android.bundle` memuat `api.elarisnoir.my.id` (1 hit) |
| Keystore | remote EAS `rm9SIrYQd2` |
| `EXPO_PUBLIC_PB_URL` | ter-inline `https://api.elarisnoir.my.id` |
| `expo-doctor` | 18/18 lolos (2026-11-12, setelah patch `expo@54.0.37`, `expo-router@6.0.24`) |
| `npm run typecheck` | 0 error |
| `test:docs`, `test:enum` | lolos |
