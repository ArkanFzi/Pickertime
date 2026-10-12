#!/usr/bin/env bash
# Regresi retensi lokal pickertime-pb-backup.sh (T-36 / CFG-62).
#
# Yang dijalankan adalah blok apply_retention yang DIEKSTRAK apa adanya dari skrip produksi,
# bukan salinan yang ditulis ulang — supaya yang terbukti di sini adalah byte yang sama.
# Nol tulis ke /opt/pickertime, nol docker, nol systemctl, nol kredensial.
#
# Kasus A adalah kontrol negatif: guard ledger dibuang lewat sed, dan kalau lubang CFG-62
# tidak lagi bisa direproduksi oleh mutasi itu, regresi ini sendiri yang harus merah.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/tools/backup/pickertime-pb-backup.sh"
WORK=$(mktemp -d)
OUT="$WORK/out.txt"
BAD=0
LULUS=0

trap 'rm -rf "$WORK"' EXIT

extract() { awk '/^ledger_has\(\) \{/,/^\}/' "$SCRIPT"; }

assert() {
  local desc="$1"; shift
  if "$@"; then
    echo "  OK    $desc"; LULUS=$((LULUS + 1))
  else
    echo "  GAGAL $desc"; BAD=$((BAD + 1))
  fi
}

count_zip() { ls -1 "$WORK/pb_data/backups"/*.zip 2>/dev/null | wc -l; }
alive() { [ -f "$WORK/pb_data/backups/$1.zip" ]; }
gone() { ! [ -f "$WORK/pb_data/backups/$1.zip" ]; }
hits() { local n; n=$(grep -c "$1" "$OUT" 2>/dev/null || true); echo "${n:-0}"; }
ledger_lines() { wc -l < "$WORK/backup-published.log" 2>/dev/null || echo 0; }
no_dangling_attrs() {
  local f
  for f in "$WORK"/pb_data/backups/*.zip.attrs; do
    [ -e "$f" ] || continue
    [ -f "${f%.attrs}" ] || return 1
  done
  return 0
}

seed() {
  rm -rf "$WORK/pb_data" "$WORK/backup-published.log"
  mkdir -p "$WORK/pb_data/backups"
  local b
  for b in 20261006032628 20261007032627 20261008124918 20261010064735 20261011060607; do
    printf 'X' > "$WORK/pb_data/backups/pb_backup_$b.zip"
    : > "$WORK/pb_data/backups/pb_backup_$b.zip.attrs"
  done
  touch -d '2026-10-06 03:26:28' "$WORK/pb_data/backups/pb_backup_20261006032628.zip"
  touch -d '2026-10-07 03:26:27' "$WORK/pb_data/backups/pb_backup_20261007032627.zip"
  touch -d '2026-10-08 12:49:18' "$WORK/pb_data/backups/pb_backup_20261008124918.zip"
  touch -d '2026-10-10 06:47:35' "$WORK/pb_data/backups/pb_backup_20261010064735.zip"
  touch -d '2026-10-11 06:06:07' "$WORK/pb_data/backups/pb_backup_20261011060607.zip"
}

ledger_isin() {
  printf '%s\n' pb_backup_20261007032627.zip pb_backup_20261008124918.zip \
    pb_backup_20261010064735.zip pb_backup_20261011060607.zip > "$WORK/backup-published.log"
}

# run_block [ekspresi-sed-untuk-mutasi]
run_block() {
  local block
  block=$(extract)
  if [ $# -gt 0 ]; then block=$(printf '%s\n' "$block" | sed "$1"); fi
  (
    export BACKUP_DIR="$WORK/pb_data/backups"
    export LEDGER_FILE="$WORK/backup-published.log"
    export LOCAL_KEEP="${LOCAL_KEEP:-2}"
    export LOCAL_MAX="${LOCAL_MAX:-4}"
    eval "$block"
    apply_retention
  ) > "$OUT" 2>&1
}

YATIM=pb_backup_20261006032628

echo "### A. Kontrol negatif: guard ledger dibuang, lubang CFG-62 HARUS tereproduksi"
seed; ledger_isin
run_block 's/ledger_has "\$f"/true/'
assert "A1 yatim terbuang oleh mutasi (regresi ini punya gigi)" gone "$YATIM"
assert "A2 pembuangan buta >= 3 zip" test "$(hits '^buang backup lokal')" -ge 3

echo "### B. Perbaikan asli: yatim ditahan, yang terpublish tetap kena kuota"
seed; ledger_isin
run_block
assert "B1 yatim HIDUP" alive "$YATIM"
assert "B2 tepat dua zip terpublish terbuang" test "$(hits 'terpublish, kuota')" -eq 2
assert "B3 yang terbuang memang yang lebih tua" gone pb_backup_20261007032627
assert "B4 total sisa = 3" test "$(count_zip)" -eq 3
assert "B5 satu baris waspada yatim" test "$(hits 'tidak tercatat terpublish, ditahan')" -eq 1
assert "B6 tidak ada .attrs yatim tertinggal" no_dangling_attrs

echo "### C. Pengecualian dibalik oleh satu baris ledger, bukan oleh kode"
seed; ledger_isin; printf '%s\n' "$YATIM.zip" >> "$WORK/backup-published.log"
run_block
assert "C1 yatim terbuang setelah dicatat terpublish" gone "$YATIM"
assert "C2 total sisa = 2" test "$(count_zip)" -eq 2

echo "### D. Ledger hilang sama sekali: LOCAL_MAX menutup no-op yang terukur di scratch"
seed
run_block
assert "D1 peringatan ledger tidak ada tercetak" test "$(hits 'ledger offload tidak ada')" -eq 1
assert "D2 tiga yatim ditahan kuota (bukan no-op senyap)" test "$(hits 'ditahan dari kuota')" -eq 3
assert "D3 sisa ditegakkan ke LOCAL_MAX=4" test "$(count_zip)" -eq 4
assert "D4 langit-langit menyebut yatim" test "$(hits '(yatim, langit-langit 4)')" -eq 1

echo "### E. Semua yatim dan langit-langit ditekan ke 3"
seed; : > "$WORK/backup-published.log"
LOCAL_MAX=3 run_block
assert "E1 sisa = 3" test "$(count_zip)" -eq 3
assert "E2 dua pembuangan total" test "$(hits '^buang backup lokal')" -eq 2
assert "E3 keduanya tercatat sebagai yatim" test "$(hits '(yatim, langit-langit 3)')" -eq 2

echo "### F. Di bawah kuota: tidak boleh ada satu pun penghapusan"
seed; ledger_isin
LOCAL_KEEP=9 LOCAL_MAX=9 run_block
assert "F1 semua 5 zip selamat" test "$(count_zip)" -eq 5
assert "F2 nol baris buang" test "$(hits '^buang backup lokal')" -eq 0

echo "### G. Ledger bersifat append-only: retensi tidak pernah menulisnya"
seed; ledger_isin
before=$(ledger_lines)
LOCAL_MAX=2 run_block
assert "G1 baris ledger utuh setelah retensi" test "$(ledger_lines)" -eq "$before"
assert "G2 langit-langit membuang yang TERPUBLISH lebih dulu" alive "$YATIM"
assert "G3 sisa = 2" test "$(count_zip)" -eq 2

echo
echo "LULUS=$LULUS GAGAL=$BAD"
[ "$BAD" -eq 0 ] || exit 1
exit 0
