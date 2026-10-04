# Tiket: Purge Riwayat GitHub

**Status:** TIDAK DIEKSEKUSI — hasil scan riwayat bersih. Dokumen ini menyimpan bukti scan dan
prosedur standby kalau suatu saat terbukti ada kredensial live yang ter-commit.

**Dibuka:** 2026-10-02 · **Pemilik:** ArkanFzi · **Blokir oleh:** persetujuan eksplisit (force-push)

## 1. Kenapa tiket ini ada

Khawatir kredensial backend lama (era Appwrite/Supabase, `GEMINI_API_KEY` di sisi client) masih
membekas di riwayat commit dan ikut terpublikasi ke `github.com/ArkanFzi/Pickertime`. Pemicu
konkretnya: `EXPO_PUBLIC_GEMINI_API_KEY` pernah ada di `.env.example`. Variabel berprefiks
`EXPO_PUBLIC_*` dibakar ke dalam bundle JS, jadi kalau isinya key asli, key itu otomatis publik.

## 2. Hasil scan (reproducible)

Semua scan dijalankan terhadap `git log --all -p` (seluruh branch: `dev`, `main`, `production`),
mencakup Pickertime + `website-porto2` + `agentic-infra`.

| Pola | Yang menangkap | Hit |
|---|---|---|
| `AIza[0-9A-Za-z_-]{20,}` | Gemini API key asli | 0 |
| `gsk_[A-Za-z0-9]{20,}` | Groq API key asli | 0 |
| `ghp_[0-9A-Za-z]{20,}` / `github_pat_[0-9A-Za-z_]{20,}` | PAT GitHub | 0 |
| `cfut_[0-9A-Za-z_-]{10,}` | token Cloudflare tunnel | 0 |
| `eyJ…\.eyJ…` | JWT (session/refresh token) | 0 |
| `xkeysalt…`, `service_role`, `sb_[A-Za-z0-9_]{15,}` | Appwrite / Supabase service key | 0 |
| `-----BEGIN … PRIVATE KEY-----` | private key | 0 |
| `Basic [A-Za-z0-9+/=]{25,}` | Basic-auth header tersalin | 0 |

Perintah ulang:

```bash
cd ~/Documents/Coding/Pickertime
git log --all -p | grep -cE 'AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{20,}|ghp_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|cfut_[0-9A-Za-z_-]{10,}'
git log --all -p | grep -oE 'EXPO_PUBLIC_GEMINI_API_KEY=.{0,20}' | sort -u   # hanya nilai placeholder
```

Nilai yang pernah muncul untuk variabel itu cuma `your_gemini_api_key` / `your_gemini_api_key_here`.
Baris lain yang menyerupai secret: `PB_ADMIN_PASSWORD=ci-only-password-123` (password palsu khusus
CI) dan `GROQ_API_KEY=gsk_your_key_here` (placeholder). File secret sungguhan tidak pernah masuk:
satu-satunya berkas yang pernah di-add dengan nama sensitif adalah `.env.example`.

Kondisi sekarang: tidak ada satu pun `EXPO_PUBLIC_*` selain `EXPO_PUBLIC_PB_URL` /
`EXPO_PUBLIC_POCKETBASE_URL` (URL, bukan secret), dan `.env.example` sudah memuat larangan
eksplisit. Key Gemini hidup hanya sebagai env proses PocketBase di server (`docs/01_architecture/backend.md` §4).

## 3. Kesimpulan

Tidak ada yang perlu di-purge. Yang perlu dijaga supaya tetap begitu: jangan pernah memindahkan
`GEMINI_API_KEY` (atau apa pun) ke prefiks `EXPO_PUBLIC_*`, dan jangan menaruh nilai di `.env*`
yang ter-commit.

## 4. Prosedur kalau suatu saat terbukti ada kredensial live

Urutan ini wajib; langkah 1 dulu, baru 2 dan seterusnya.

1. **Rotasi/revoke kredensialnya dulu.** Purge history tidak membuat bocor jadi tidak bocor —
   selama key lama masih aktif, riwayat yang sudah di-fetch orang tetap berguna bagi mereka.
2. `gitleaks detect --source . --log-opts="--all"` (atau scan manual seperti §2) untuk memastikan
   tidak ada temuan lain sebelum menulis ulang history.
3. Rewrite dengan `git-filter-repo` (bukan `filter-branch`, yang sudah deprecated):
   ```bash
   pip install git-filter-repo
   git filter-repo --invert-paths --path .env --path-glob '*.env' --force
   git remote add origin https://github.com/ArkanFzi/Pickertime.git
   ```
4. **Minta persetujuan eksplisit sebelum push.** `git push --all --force` + `git push --tags
   --force` mengubah sejarah bersama; branch `main` adalah branch produksi (dilarang push langsung
   menurut `AGENTS.md`), jadi rewrite-nya menyentuh jalur deploy.
5. Minta GitHub Supportexpire cached commits/diffs (PR, commit view, dan fork tetap menyimpan
   objek lama): https://support.github.com/contact → permintaan "remove cached objects".
6. Bersihkan konsekuensi lokal: setiap clone lain harus di-klone ulang (bukan `git pull`), PR lama
   yang menggantung harus di-rebase, dan tag release harus dibuat ulang dari commit baru.
7. Verifikasi akhir: `git log --all --oneline | wc -l` cocok dengan rencana, lalu scan §2 di
   clone baru, dan cek `https://github.com/ArkanFzi/Pickertime/commits/main` tidak menampilkan
   blob lama.

## 5. Checklist tersisa

- [ ] Confirm: branch `production` di origin masih dibutuhkan? Kalau tidak, hapus branch itu
      (riwayatnya ikut masuk scan di atas dan cuma melebarkan permukaan).
- [ ] Branch protection di `main` belum terpasang — push `61b57b9..2d024ab` di repo porto2 lolos
      tanpa penolakan, dan pola yang sama berlaku di sini.
- [ ] Kalau `gitleaks` sudah terpasang di laptop: tambahkan sebagai step CI di `.github/workflows/ci.yml`
      supaya §2 tidak lagi bergantung pada ingatan manusia.
