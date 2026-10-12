#!/usr/bin/env bash
# Harness hermetic untuk pickertime-tools-drift.sh (T-38, penutup CFG-70).
#
# Kenapa perlu harness sendiri: hijau saja bukan bukti. CFG-70 lahir dari berkas yang cocok
# antara laptop dan VM hanya karena aku membandingkannya TANGAN, dan CFG-26/CFG-66 sudah
# menunjukkan dua cara penjaga menipu dirinya sendiri -- merah karena cacat pada dirinya
# (satu karakter hilang), atau hijau karena tidak mengukur apa pun. Karena itu tiap kasus di
# bawah menuntut angka spesifik, termasuk "rc=1 saat transport mati" (SSH_GAGAL), supaya
# penjaga yang buta tidak bisa lulus.
#
# Daftar pasangan DIEKSTRAK dari penjaga itu sendiri (`awk` pada blok PAIRS), bukan disalin:
# pasangan baru ikut terjaga tanpa harness ini perlu disunting.
# Nol tulisan ke repo nyata, nol jaringan: `gcloud` diganti shim yang membaca pohon VM
# tiruan di $WORK, dan kedua "repo" adalah repo git tempelan yang dibuat di sini.
#
# Sengaja TANPA `pipefail`: beberapa assertion di sini adalah `fungsi | grep -q`, dan `grep -q`
# berhenti membaca begitu cocok. Dengan pipefail, status fungsi di sebelah kiri (atau SIGPIPE
# yang menimpanya) ikut menentukan -- hasil pemeriksaan jadi merah walau penjaga benar. Ini
# bug harness yang ketemu di jalan hari ini (terukur: `cfg_yang_dijaga | grep -qx` untuk baris
# pertama mengembalikan 141 padahal grep cocok), jadi bentuknya dijaga di dua tempat: tanpa
# pipefail dan tiap fungsi assertion berakhir `return 0`.
set -u

GUARD="${GUARD:-$(cd "$(dirname "$0")" && pwd)/pickertime-tools-drift.sh}"
[ -r "$GUARD" ] || { printf 'GAGAL penjaga tidak terbaca: %s\n' "$GUARD"; exit 2; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mapfile -t ENTRIES < <(awk '/^PAIRS=\(/,/^\)/' "$GUARD" | grep -oE '"[^"]+"' | tr -d '"')
N=${#ENTRIES[@]}
# Anti-vakum: sembilan pasangan backup/deploy + dua pasangan config-agentic (healthcheck dan
# compose). Angka ini turun berarti ada pasangan yang hilang dari daftar, dan itu harus merah.
MIN_N=11
MARKER='MARKER-ISI-BERKAS-JANGAN-CETAK'

lulus=0; gagal=0
ok() { lulus=$((lulus + 1)); printf 'LULUS %s\n' "$1"; }
no() { gagal=$((gagal + 1)); printf 'GAGAL %s\n' "$1"; }

PT="$WORK/pt-repo"; CFG="$WORK/cfg-repo"; VMROOT="$WORK/vm"
mkdir -p "$PT" "$CFG" "$VMROOT" "$WORK/bin"
git init -q -b main "$PT"; git init -q -b main "$CFG"
gc=(-c user.name=harness -c user.email=harness@local -c commit.gpgsign=false)

sisi_repo() { case "$1" in cfg) printf '%s' "$CFG" ;; *) printf '%s' "$PT" ;; esac; }

# --- dunia tiruan: satu berkas per pasangan, isi VM sama dengan isi repo (keadaan nol drift) ---
for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r vm vm_path repo_path src <<<"$entry"
  src="${src:-pt}"
  dir=$(sisi_repo "$src")
  mkdir -p "$dir/$(dirname "$repo_path")" "$VMROOT/$vm/$(dirname "$vm_path")"
  {
    printf '# bahan uji %s\n' "$repo_path"
    printf 'PATH_DI_VM=%s\n' "$vm_path"
    printf '%s=%s\n' "$MARKER" "$repo_path"
  } > "$dir/$repo_path"
  cp "$dir/$repo_path" "$VMROOT/$vm/$vm_path"
done
git -C "$PT" "${gc[@]}" add -A >/dev/null && git -C "$PT" "${gc[@]}" commit -qm "bahan uji pt" >/dev/null
git -C "$CFG" "${gc[@]}" add -A >/dev/null && git -C "$CFG" "${gc[@]}" commit -qm "bahan uji cfg" >/dev/null

# --- shim gcloud: kontrak keluaran sama persis dengan ssh nyata ---
cat > "$WORK/bin/gcloud" <<'SHIM'
#!/usr/bin/env bash
# Mengganti `gcloud compute ssh <vm> ... --command="echo B64 | base64 -d | sudo -n bash"`.
# Byte yang di-hash dibaca dari $VMROOT/<nama-vm>/<jalur-asli>, tapi nama yang dicetak tetap
# jalur asli -- kalau tidak, kunci kamus penjaga tidak cocok dan seluruh baris jadi merah palsu.
[ "${1:-}" = "compute" ] && [ "${2:-}" = "ssh" ] || exit 9
vm="$3"
cmd=""
for a in "$@"; do case "$a" in --command=*) cmd="${a#--command=}" ;; esac; done
[ -n "$cmd" ] || exit 9
if [ "${SHIM_MODE:-ok}" = "fail" ]; then
  printf 'shim: tunnel ditolak (simulasi transport mati)\n' >&2
  exit 1
fi
snippet=$(printf '%s' "$cmd" | awk '{print $2}' | base64 -d 2>/dev/null) || exit 9
# `[^;]*` bukan `.*`: pola serakah mengambil sampai `; do` TERAKHIR di baris itu, dan `; done`
# di ujung snippet juga diawali `; do` -- jalur terakhir ikut keawa tanda `;` sehingga kuncinya
# tidak cocok dan barisnya jadi TIDAK_DIUKUR (bug shim yang terukur hari ini, bukan bug penjaga).
paths=$(printf '%s' "$snippet" | sed -n 's/^for p in \([^;]*\); do.*/\1/p')
[ -n "$paths" ] || exit 9
for p in $paths; do
  f="$VMROOT/$vm$p"
  if [ -r "$f" ]; then
    printf '%s %s\n' "$(sha256sum "$f" | cut -c1-16)" "$p"
  else
    printf 'TIDAK_KEBACA %s\n' "$p"
  fi
done
SHIM
chmod +x "$WORK/bin/gcloud"

jalankan() {
  env PATH="$WORK/bin:$PATH" VMROOT="$VMROOT" SHIM_MODE="${1:-ok}" \
      REPO="$PT" REF=main CFG_REPO="$CFG" CFG_REF=main ZONE=fake PROJECT=fake \
      bash "$GUARD" 2>&1
}

_repo_path_of() { IFS='|' read -r _ _ rp s <<<"$1"; printf '%s' "${rp:-}"; }
_src_of() { IFS='|' read -r _ _ _ s <<<"$1"; printf '%s' "${s:-pt}"; }

# pulangkan isi sisi VM ke versi repo untuk satu jalur repo (bukti proteksi bisa dibalik)
pulihkan() {
  local want_repo="$1" want_src="$2" entry vm vm_path rp s dir
  for entry in "${ENTRIES[@]}"; do
    IFS='|' read -r vm vm_path rp s <<<"$entry"
    s="${s:-pt}"
    [ "$rp" = "$want_repo" ] && [ "$s" = "$want_src" ] || continue
    dir=$(sisi_repo "$want_src")
    mkdir -p "$VMROOT/$vm/$(dirname "$vm_path")"
    if [ -r "$dir/$want_repo" ]; then
      cp "$dir/$want_repo" "$VMROOT/$vm/$vm_path"
    else
      rm -f "$VMROOT/$vm/$vm_path"
    fi
  done
}

cfg_yang_dijaga() {
  local entry
  for entry in "${ENTRIES[@]}"; do
    [ "$(_src_of "$entry")" = "cfg" ] && printf '%s\n' "$(_repo_path_of "$entry")"
  done
  return 0
}

rc=0; out=""
jalankan_case() { out=$(jalankan "${1:-ok}"); rc=$?; }

printf '=== harness penjaga drift: %s pasangan, penjaga=%s ===\n' "$N" "$GUARD"

# --- 0: bentuk daftar pasangan ---
if [ "$N" -ge "$MIN_N" ]; then ok "daftar pasangan tidak mengecil (n=$N >= $MIN_N)"; else
  no "daftar pasangan menyusut (n=$N < $MIN_N)"; rc=1; fi
n_cfg=$(cfg_yang_dijaga | wc -l)
if [ "$n_cfg" -ge 2 ]; then ok "pasangan bersumber config-agentic terbaca dari blok PAIRS (n=$n_cfg)"; else
  no "pasangan cfg tidak terbaca (n=$n_cfg)"; rc=1; fi
for need in scripts/hermes_healthcheck.py docker-compose.yml; do
  if cfg_yang_dijaga | grep -qx "$need"; then ok "penjaga menyebut $need"; else
    no "penjaga tidak menyebut $need -- CFG-70 belum tertutup"; rc=1; fi
done

# --- 1: keadaan nol drift -> hijau, dan isi berkas tidak pernah tercetak ---
jalankan_case
sama=$(printf '%s\n' "$out" | grep -c '^SAMA')
beda=$(printf '%s\n' "$out" | grep -c '^BEDA')
if [ "$rc" = "0" ] && [ "$sama" = "$N" ] && [ "$beda" = "0" ] \
   && printf '%s\n' "$out" | grep -qx "periksa=$N drift=0"; then
  ok "nol drift -> rc=0, periksa=$N drift=0, SAMA=$sama"
else
  no "nol drift salah verdiK (rc=$rc sama=$sama beda=$beda): $(printf '%s\n' "$out" | tail -1)"; rc=1
fi
if printf '%s\n' "$out" | grep -q "$MARKER"; then
  no "isi berkas tercetak ke keluaran (pelanggaran H13)"; rc=1
else
  ok "keluaran cuma nama + hash 16 karakter, tidak ada isi berkas"
fi

# --- 2: SATU BYTE berubah pada berkas yang memutuskan restart otak ---
HC_VM="$VMROOT/hermes-openclaw-vm/home/arkan/openclaw-docker/scripts/hermes_healthcheck.py"
if [ -r "$HC_VM" ]; then
  printf 'SISIPAN\n' >> "$HC_VM"
  jalankan_case
  if [ "$rc" = "1" ] && printf '%s\n' "$out" | grep -q '^BEDA .*cfg:scripts/hermes_healthcheck\.py' \
     && printf '%s\n' "$out" | grep -qx "periksa=$N drift=1"; then
    ok "satu byte berubah di healthcheck -> rc=1, BEDA menunjuk pasangan cfg itu, drift=1"
  else
    no "mutasi healthcheck tidak tertangkap (rc=$rc): $(printf '%s\n' "$out" | grep '^BEDA' | head -2 | tr '\n' ' ')"; rc=1
  fi
  pulihkan scripts/hermes_healthcheck.py cfg
else
  no "berkas healthcheck tidak ada di pohon VM tiruan"; rc=1
fi

# --- 3: sisi REPO hilang, sisi VM ada (persis bentuk CFG-70: berkas cuma hasil tulis keluar-jalur) ---
git -C "$CFG" "${gc[@]}" rm -q scripts/hermes_healthcheck.py
git -C "$CFG" "${gc[@]}" commit -qm "hapus healthcheck dari repo"
jalankan_case
if [ "$rc" = "1" ] && printf '%s\n' "$out" | grep 'BEDA' | grep -q 'hermes_healthcheck.py.*repo=REPO_TIDAK_ADA'; then
  ok "repo-side hilang -> rc=1 dengan repo=REPO_TIDAK_ADA, bukan SAMA diam-diam"
else
  no "repo-side hilang tidak tertangkap (rc=$rc): $(printf '%s\n' "$out" | grep '^BEDA' | head -2 | tr '\n' ' ')"; rc=1
fi
git -C "$CFG" "${gc[@]}" checkout -q HEAD~1 -- scripts/hermes_healthcheck.py
git -C "$CFG" "${gc[@]}" commit -qm "kembalikan healthcheck ke repo"
pulihkan scripts/hermes_healthcheck.py cfg

# --- 4: sisi VM hilang -> merah dan menunjuk vm=TIDAK_KEBACA ---
rm -f "$HC_VM"
jalankan_case
if [ "$rc" = "1" ] && printf '%s\n' "$out" | grep 'BEDA' | grep -q 'hermes_healthcheck.py.*vm=TIDAK_KEBACA'; then
  ok "vm-side hilang -> rc=1 dengan vm=TIDAK_KEBACA"
else
  no "vm-side hilang tidak tertangkap (rc=$rc): $(printf '%s\n' "$out" | grep '^BEDA' | head -2 | tr '\n' ' ')"; rc=1
fi
pulihkan scripts/hermes_healthcheck.py cfg

# --- 5: isolasi kunci per-sumber: mutasi pasangan pt tidak menyeret pasangan cfg ---
PT_VM="$VMROOT/hermes-openclaw-vm/opt/pickertime/pickertime-pb-backup.sh"
printf 'MUTASI\n' >> "$PT_VM"
jalankan_case
cfg_beda=$(printf '%s\n' "$out" | grep '^BEDA' | grep -c 'cfg:')
pt_beda=$(printf '%s\n' "$out" | grep '^BEDA' | grep -c 'pt:')
if [ "$rc" = "1" ] && [ "$pt_beda" = "1" ] && [ "$cfg_beda" = "0" ]; then
  ok "kunci per-sumber bekerja: hanya pasangan pt yang merah (pt=1 cfg=0)"
else
  no "isolasi sumber bocor (rc=$rc pt=$pt_beda cfg=$cfg_beda)"; rc=1
fi
pulihkan tools/backup/pickertime-pb-backup.sh pt

# --- 6: transport mati total -> SSH_GAGAL + rc=1, bukan hijau hampa ---
jalankan_case fail
gagal_ssh=$(printf '%s\n' "$out" | grep '^BEDA' | grep -c 'vm=SSH_GAGAL')
if [ "$rc" = "1" ] && [ "$gagal_ssh" = "$N" ] && ! printf '%s\n' "$out" | grep -qx "periksa=$N drift=0"; then
  ok "ssh mati -> rc=1 dan $gagal_ssh/$N baris menyebut vm=SSH_GAGAL (penjaga tidak lulus karena diam)"
else
  no "ssh mati lolos tanpa merah (rc=$rc ssh_gagal=$gagal_ssh)"; rc=1
fi

# --- 7: semua mutasi sudah dipulangkan -> hijau lagi (proteksi bisa dibalik) ---
jalankan_case
if [ "$rc" = "0" ] && printf '%s\n' "$out" | grep -qx "periksa=$N drift=0"; then
  ok "keadaan bersih -> rc=0 lagi setelah semua mutasi dipulangkan"
else
  no "keadaan bersih tidak pulih (rc=$rc): $(printf '%s\n' "$out" | tail -2 | tr '\n' ' ')"; rc=1
fi

printf 'LULUS=%s GAGAL=%s\n' "$lulus" "$gagal"
[ "$gagal" -eq 0 ] || exit 1
