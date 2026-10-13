#!/usr/bin/env bash
# Regresi jalur ukur P8 (tools/deploy/pb-stability-check.sh).
#
# Kenapa ini perlu: penjaga harian ini sudah dua kali buta dengan suara yang salah (CFG-64:
# PATH cron, lalu hari tanpa baris), dan buta ketiga datang 2026-10-13 08:38:08 WIB dari
# sebab yang sama sekali baru — `Persistent=true` menagih hari yang terlewat satu detik
# sesudah boot, jadi gcloud IAP dipanggil sebelum jaringan naik, keluarannya kosong, dan
# barisnya masih terbaca seperti masalah state VM. Tidak ada satu pun kasus di bawah yang
# menyentuh mesin nyata: `gcloud` dan `curl` dipalsukan di PATH, HOME dan LOG_DIR diarahkan
# ke direktori kerja sementara, nol tulis ke /opt/pickertime dan nol jaringan keluar.
#
# Kasus L adalah kontrol negatif: loop retry dimutasi sampai nol percobaan, dan kalau mutasi
# itu tidak lagi membuat kasus sehat jadi merah, regresi inilah yang harus dinyatakan buta.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/tools/deploy/pb-stability-check.sh"
WORK=$(mktemp -d)
BIN="$WORK/bin"
STATE="$WORK/state"
HOME_UJI="$WORK/home"
BAD=0
LULUS=0

trap 'rm -rf "$WORK"' EXIT

mkdir -p "$BIN" "$STATE" "$HOME_UJI/.config/gcloud" "$WORK/noconfig/home"
OK_STAMP=$(date -u -d '4 hours ago' +%FT%TZ)

cat > "$BIN/gcloud" <<'FAKE'
#!/usr/bin/env bash
n=$(cat "$STATE/panggilan" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$STATE/panggilan"
case "$UJI_MODE" in
  sehat)
    echo "$UJI_OK 0"
    ;;
  pulih_kedua)
    if [ "$n" -ge 2 ]; then echo "$UJI_OK 0"; else echo "ERROR: Tunnel implementation failed. Please contact your client's network administrator for further assistance. Network is unreachable" >&2; exit 1; fi
    ;;
  gagal_selalu)
    echo "ERROR: gcloud compute ssh $UJI_OK gagal: upstream connect error" >&2
    exit 1
    ;;
  kosong_rc0)
    exit 0
    ;;
  lambat)
    sleep 3
    echo "ERROR: telat sekali" >&2
    exit 1
    ;;
  sampah)
    echo "bukan-tanggal 0"
    ;;
  bocor)
    echo "ERROR: request ditolak, credential ya29.MOCKTOKENABCDEFGHIJKLMNOPQRS tidak berlaku untuk abcdefghijklmnopqrstuvwxyz0123456789" >&2
    exit 1
    ;;
esac
exit 0
FAKE

cat > "$BIN/curl" <<'FAKE'
#!/usr/bin/env bash
# -o /dev/null ditiru: hanya panggilan health (-w %{http_code}) yang boleh mencetak kode,
# supaya probe jaringan tidak menumpahkan "200" ke stdout skrip seperti curl sungguhan.
case "$*" in
  *-w*) echo 200 ;;
esac
if [ -n "${UJI_CURL_MATI:-}" ]; then
  exit 6
fi
exit 0
FAKE

chmod +x "$BIN/gcloud" "$BIN/curl"

# PATH-nya dibuat hermetis, bukan "PATH aslinya dikurangi gcloud". Alasan terukur 2026-10-13:
# kasus G dulu memakai PATH=/usr/bin:/bin dengan premis "gcloud tidak ada di situ". Di laptop
# premis itu benar (gcloud tinggal di ~/.local/bin), di runner GitHub ubuntu-latest salah karena
# image-nya memasang gcloud di /usr/bin -- harness pun hijau di rumah dan merah di CI, dan yang
# merah adalah premisnya, bukan skrip yang diujinya. Jadi dipakai $TOOLS: direktori berisi symlink
# ke alat yang memang dibutuhkan skrip, tanpa gcloud, dan tanpa /usr/bin.
TOOLS="$WORK/tools"
BIN_NOGC="$WORK/bin-nogcloud"
DECOY="$WORK/decoy"
mkdir -p "$TOOLS" "$BIN_NOGC" "$DECOY"
for t in bash sed grep cut head tail wc date tee mktemp rm mkdir sleep timeout cat tr; do
  p=$(command -v "$t") || { echo "ALAT UJI GAGAL: '$t' tidak ada di PATH pembuat harness"; exit 2; }
  ln -s "$p" "$TOOLS/$t"
done
ln -s "$BIN/curl" "$BIN_NOGC/curl"

# Decoy = gcloud "milik host" yang meniru keadaan runner: kalau dia pernah yang menjawab,
# angka di bawah ini bukan lagi angka dari mock.
cat > "$DECOY/gcloud" <<'FAKE'
#!/usr/bin/env bash
echo "DECOY_SENGETIDAK_SEPAKAM"
exit 0
FAKE
chmod +x "$DECOY/gcloud"

# panggilan <nama> <mode> [env-tambahan...]
# Flag UJI_HOME_LAIN / UJI_TANPA_GCLOUD dipakai fungsi ini sendiri (bukan diteruskan ke
# env), sisanya jadi penimpa P8_* lewat env.
panggilan() {
  local nama="$1" mode="$2"
  shift 2
  local out="$WORK/out.$nama"
  local home="$HOME_UJI"
  local jalur="$BIN:$TOOLS"
  local a
  local -a extra=()
  for a in "$@"; do
    case "$a" in
      UJI_HOME_LAIN=*) home="$WORK/noconfig/home" ;;
      UJI_TANPA_GCLOUD=*) jalur="$BIN_NOGC:$TOOLS" ;;
      UJI_DECOY=*) jalur="$BIN:$DECOY:$TOOLS" ;;
      *) extra+=("$a") ;;
    esac
  done
  rm -f "$STATE/panggilan"
  env -i PATH="$jalur" HOME="$home" STATE="$STATE" \
    LOG_DIR="$WORK/log.$nama" UJI_MODE="$mode" UJI_OK="$OK_STAMP" \
    P8_PEMICU=manual P8_COBA=3 P8_JEDA=1 P8_KISARAN=5 P8_BATAS=30 \
    ${extra[@]+"${extra[@]}"} bash "$SCRIPT" >"$out" 2>&1
  echo "$?" > "$out.rc"
  echo "$out"
}

isi() { cat "$1"; }
rc_dari() { cat "$1.rc"; }
ada() { grep -qF -- "$2" "$1"; }
tak_ada() { ! grep -qF -- "$2" "$1"; }
panggilan_sudah() { [ "$(cat "$STATE/panggilan" 2>/dev/null || echo 0)" = "$1" ]; }

cek() {
  local d="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  OK    $d"
    LULUS=$((LULUS + 1))
  else
    echo "  GAGAL $d"
    BAD=$((BAD + 1))
  fi
}

echo "== A. sehat: satu panggilan, HIJAU, tanpa retry =="
o=$(panggilan a sehat)
cek "A rc=0" test "$(rc_dari "$o")" = 0
cek "A STATUS=HIJAU" ada "$o" "STATUS=HIJAU"
cek "A pemicu=manual" ada "$o" "pemicu=manual"
cek "A health_http=200" ada "$o" "health_http=200"
cek "A hasil_terendap=0" ada "$o" "hasil_terendap=0"
cek "A hanya satu panggilan gcloud" panggilan_sudah 1
cek "A stdout tepat satu baris (tidak ada tumpahan alat palsu)" test "$(wc -l < "$o")" -eq 1
cek "A baris yang sama ikut masuk log" ada "$WORK/log.a/p8.log" "STATUS=HIJAU"

echo "== B. jaringan naik telat: gagal lalu pulih pada percobaan kedua =="
o=$(panggilan b pulih_kedua)
cek "B rc=0" test "$(rc_dari "$o")" = 0
cek "B STATUS=HIJAU sesudah retry" ada "$o" "STATUS=HIJAU"
cek "B benar-benar memanggil ulang (2x)" panggilan_sudah 2

echo "== C. gagal selalu: rc, jumlah percobaan, dan stderr ikut tercetak =="
o=$(panggilan c gagal_selalu)
cek "C rc=1" test "$(rc_dari "$o")" = 1
cek "C baris ERROR" ada "$o" "ERROR pemicu=manual"
cek "C menunjuk rc gcloud" ada "$o" "rc=1"
cek "C menunjuk jumlah percobaan" ada "$o" "percobaan=3"
cek "C stderr alat disertakan" ada "$o" "stderr: ERROR: gcloud compute ssh"
cek "C berhenti setelah P8_COBA" panggilan_sudah 3

echo "== D. gcloud balasa kosong dengan rc=0: jangan terbaca seperti sukses =="
o=$(panggilan d kosong_rc0)
cek "D rc=1" test "$(rc_dari "$o")" = 1
cek "D rc gcloud = 0 tertulis" ada "$o" "rc=0"
cek "D tetap tiga percobaan" ada "$o" "percobaan=3"

echo "== E. per coba melampaui P8_KISARAN: sebabnya timeout, bukan ssh =="
o=$(panggilan e lambat P8_KISARAN=1)
cek "E rc=1" test "$(rc_dari "$o")" = 1
cek "E menyebut rc=124" ada "$o" "rc=124"
cek "E menyebut batas per percobaan" ada "$o" "kena batas 1 dtk per percobaan"

echo "== F. stderr berisi token: log hanya boleh melihat REDACTED =="
o=$(panggilan f bocor)
cek "F rc=1" test "$(rc_dari "$o")" = 1
cek "F stderr disertakan (bukan hilang diam-diam)" ada "$o" "stderr:"
cek "F ya29 tidak lolos" tak_ada "$o" "ya29.MOCKTOKENABCDEFGHIJKLMNOPQRS"
cek "F deretan panjang tidak lolos" tak_ada "$o" "abcdefghijklmnopqrstuvwxyz0123456789"

echo "== G. gcloud hilang dari PATH (regresi CFG-64 yang lama) =="
o=$(panggilan g sehat UJI_TANPA_GCLOUD=1)
cek "G rc=1" test "$(rc_dari "$o")" = 1
cek "G menunjuk PATH" ada "$o" "gcloud tidak ada di PATH"
# Premis kasus ini yang jatuh di CI 2026-10-13 (runner punya /usr/bin/gcloud, laptop tidak),
# jadi premisnya ikut diuji, bukan cuma disimpulkan dari bentuk PATH.
cek "G sandbox memang tidak punya gcloud" test -z "$(env -i PATH="$BIN_NOGC:$TOOLS" "$TOOLS/bash" -c 'command -v gcloud' 2>/dev/null)"
cek "G sandbox tidak kosong (timeout tetap ada)" test -n "$(env -i PATH="$BIN_NOGC:$TOOLS" "$TOOLS/bash" -c 'command -v timeout' 2>/dev/null)"
cek "G PATH di pesan memang sandbox" ada "$o" "$BIN_NOGC"

echo "== H. ~/.config/gcloud hilang: sebabnya kredensial, bukan data (keluaran kosong) =="
o=$(panggilan h kosong_rc0 UJI_HOME_LAIN=1)
cek "H rc=1" test "$(rc_dari "$o")" = 1
cek "H menunjuk kredensial" ada "$o" "kredensial gcloud tidak ada"

echo "== I. rc alat != 0 dan endpoint tidak terjangkau: ini jaringan, bukan data =="
o=$(panggilan i gagal_selalu UJI_CURL_MATI=1)
cek "I rc=1" test "$(rc_dari "$o")" = 1
cek "I menyebut jaringan tidak terjangkau" ada "$o" "tidak terjangkau"

echo "== J. LAST_OK ada tapi bukan tanggal: keluaran mentah tidak dicetak =="
o=$(panggilan j sampah)
cek "J rc=1" test "$(rc_dari "$o")" = 1
cek "J menyebut bukan tanggal" ada "$o" "bukan tanggal"
cek "J menyebut panjang, bukan nilai" ada "$o" "panjang keluaran="

echo "== K. P8_BATAS ditegakkan: baris ERROR tetap lahir sebelum unit kena SIGTERM =="
awal=$(date -u +%s)
o=$(panggilan k gagal_selalu P8_COBA=9 P8_JEDA=5 P8_BATAS=2)
lama=$(( $(date -u +%s) - awal ))
cek "K rc=1" test "$(rc_dari "$o")" = 1
cek "K satu baris ERROR ada (bukan nol baris)" ada "$o" "ERROR pemicu=manual"
cek "K berhenti karena batas, bukan kuota percobaan" ada "$o" "percobaan=2"
cek "K lama jalan di bawah 10 dtk" test "$lama" -lt 10

echo "== L. kontrol negatif: loop retry dimatikan, kasus sehat HARUS merah =="
cek "L loop retry masih ada di sumber skrip" grep -qF 'while [ "$coba" -lt "$P8_COBA" ]' "$SCRIPT"
sed 's/\[ "$coba" -lt "$P8_COBA" \]/[ "$coba" -lt 0 ]/' "$SCRIPT" > "$WORK/mutasi.sh"
cek "L mutasi benar-benar mengubah byte loop" grep -qF '[ "$coba" -lt 0 ]' "$WORK/mutasi.sh"
out_m="$WORK/out.l"
rm -f "$STATE/panggilan"
env -i PATH="$BIN:$TOOLS" HOME="$HOME_UJI" STATE="$STATE" \
  LOG_DIR="$WORK/log.l" UJI_MODE=sehat UJI_OK="$OK_STAMP" \
  P8_PEMICU=manual P8_COBA=3 P8_JEDA=1 P8_KISARAN=5 P8_BATAS=30 \
  bash "$WORK/mutasi.sh" >"$out_m" 2>&1
rc_m=$?
cek "L skrip termutasi gagal pada keadaan sehat" test "$rc_m" -eq 1
cek "L skrip termutasi mencetak satu baris ERROR" test "$(grep -c 'ERROR' "$out_m")" -eq 1
cek "L skrip termutasi tidak pernah memanggil gcloud" test "$(cat "$STATE/panggilan" 2>/dev/null || echo 0)" = 0

echo "== M. decoy gcloud di PATH (meniru runner): mock yang menjawab, bukan yang host =="
# Kasus ini lahir dari kegagalan CI 2026-10-13: image ubuntu-latest memasang gcloud di /usr/bin,
# jadi "PATH tanpa gcloud" yang dulu dipakai kasus G ternyata masih memuat gcloud sungguhan.
# Kalau suatu hari PATH harness diisi ulang dengan direktori host, M yang berteriak lebih dulu.
o=$(panggilan m sehat UJI_DECOY=1)
cek "M rc=0" test "$(rc_dari "$o")" = 0
cek "M HIJAU" ada "$o" "STATUS=HIJAU"
cek "M decoy tidak pernah menjawab" tak_ada "$o" "DECOY_SENGETIDAK_SEPAKAM"
cek "M mock yang dipanggil" panggilan_sudah 1
cek "M decoy memang ada dan bisa dieksekusi" test -x "$DECOY/gcloud"

echo
echo "LULUS=$LULUS GAGAL=$BAD"
[ "$BAD" -eq 0 ]
