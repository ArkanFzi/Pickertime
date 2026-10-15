#!/usr/bin/env bash
# Regresi blok SUMBER TOKEN (metadata|key) di tiga skrip produksi:
# tools/deploy/pickertime-pb-agent.sh, tools/backup/pickertime-pb-backup.sh,
# tools/backup/pickertime-pb-relay.sh.
#
# Kenapa ini perlu: pemisahan identitas (T-10 / CFG-20, Opsi A) hanya berguna kalau kredensial
# yang baru tidak bisa dipungut proses lain. Sebelum jendela ini bearer masuk ke argv lewat
# `-H "Authorization: Bearer $TOKEN"`, dan `ps -eo args` terbaca dari host oleh uid 1000
# (kontainer otak jalan di host yang sama) — jadi kunci sempit pun bisa dicuri lewat argv,
# yang berarti memindahkan kebocoran, bukan menutupnya. Kasus C, E, Q adalah assertinya;
# kasus S dan T adalah kontrol negatifnya (mutasi yang harus membuat C dan Q merah), supaya
# gerbang ini terbukti bisa merah dan bukan diam-diam hijau (kelas CFG-64: penjaga salah bicara).
#
# Nol jaringan keluar: `curl` dipalsukan di PATH dan hanya dua ujung yang ditirunya (metadata
# dan oauth2). Kunci RSA dibuat sementara di direktori kerja. Nol tulis ke /opt/pickertime.
#
# Batas jujur harness ini, terukur 2026-10-15: karena curl dipalsukan, ia tidak bisa menilai
# apakah oauth2 menerima klaim kita. Default `aud` yang salah (`https://pubsub.googleapis.com/`)
# lolos di sini dan baru ketahuan di mesin nyata dengan "Invalid JWT: Failed audience check".
# Kasus V menutup sebagian celah itu dengan memaksa nilai endpoint token jadi pin, bukan cermin
# dari default, supaya regresi bentuk URI API dibuat merah oleh assert, bukan oleh tebakan.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
AGENT="$ROOT/tools/deploy/pickertime-pb-agent.sh"
BACKUP="$ROOT/tools/backup/pickertime-pb-backup.sh"
RELAY="$ROOT/tools/backup/pickertime-pb-relay.sh"
WORK=$(mktemp -d)
BIN="$WORK/bin"
STATE="$WORK/state"
SHM="$WORK/shm"
BLK="$WORK/blok.sh"
BLK_MUT="$WORK/blok-mutasi.sh"
BLK_AUD_MUT="$WORK/blok-aud-mutasi.sh"
CFG="$SHM/pb-under-test-authcfg"
TOKC="$SHM/pb-under-test-token"
LULUS=0
GAGAL=0
LAST_OUT='' LAST_RC=0 LAST_ERR=''
declare -a EV=()
declare -a JALUR

trap 'rm -rf "$WORK"' EXIT
mkdir -p "$BIN" "$STATE" "$SHM" "$WORK/home"

M1='SUMBER TOKEN (metadata | key) === [BEGIN]'
M2='SUMBER TOKEN (metadata | key) === [END]'

cat > "$BIN/curl" <<'FAKE'
#!/usr/bin/env bash
# Curl palsu: catat argv PERSIS seperti yang dilihat `ps`, tiru ujung metadata + oauth2,
# dan rekam berkas yang dirujuk --config / --data-binary supaya bisa diperiksa pemanggil.
printf '%s\n' "$*" >> "$STATE/argv"
prev=''
for a in "$@"; do
  case "$prev" in
    --config | -K) [ -r "$a" ] && cp "$a" "$STATE/cfg" ;;
  esac
  case "$prev" in
    --data-binary | --data | --data-raw | -d)
      case "$a" in @*) [ -r "${a#@}" ] && cp "${a#@}" "$STATE/grant" ;; esac ;;
  esac
  prev=$a
done
[ -n "${UJI_CURL_RC:-}" ] && exit "$UJI_CURL_RC"
for a in "$@"; do
  case "$a" in
    *default/token*)
      if [ "${UJI_METADATA_BURUK:-}" = 1 ]; then
        jq -cn --arg t 'palsu"injeksi\bsalah' '{access_token:$t,expires_in:3599}'
      else
        printf '{"access_token":"palsu-token-metadata","expires_in":3599,"token_type":"Bearer"}'
      fi
      exit 0 ;;
    *oauth2.googleapis.com*)
      if [ -n "${UJI_OAUTH2_BODY:-}" ]; then printf '%s' "$UJI_OAUTH2_BODY"
      else printf '{"access_token":"palsu-token-kunci","expires_in":%s,"token_type":"Bearer"}' "${UJI_TTL:-3600}"
      fi
      exit 0 ;;
  esac
done
echo "curl palsu: ujung tak dikenal" >&2
exit 6
FAKE
chmod +x "$BIN/curl"

openssl genrsa -out "$WORK/key.pem" 2048 2>/dev/null
EMAIL="pb-deploy-agent@config-agentic-ubuntu.iam.gserviceaccount.com"
jq -n --arg e "$EMAIL" --rawfile k "$WORK/key.pem" \
  '{client_email:$e, private_key:$k, token_uri:"https://oauth2.googleapis.com/token"}' > "$WORK/sa.json"
jq 'del(.client_email)' "$WORK/sa.json" > "$WORK/sa-tanpa-email.json"
jq 'del(.private_key)' "$WORK/sa.json" > "$WORK/sa-tanpa-key.json"

# Blok diambil dari skrip produksi, bukan disalin ke berkas uji. Pencocokan marker memakai
# index(), bukan regex: penandanya mengandung `[`/`]`/`|` yang di regex berubah jadi kelas
# karakter — terukur hari ini, ekstraksi via sed `/[BEGIN]/` mencetak NOL baris dan kasus
# "blok identik" malah hijau di atas berkas kosong.
cari_blok() { awk -v m1="$M1" -v m2="$M2" 'index($0,m1){mulai=1} mulai{print} index($0,m2){exit}' "$1"; }
cari_blok "$AGENT" > "$BLK"
cari_blok "$BACKUP" > "$WORK/blok-backup.txt"
cari_blok "$RELAY" > "$WORK/blok-relay.txt"
JALUR=(env -i "PATH=$BIN:/usr/bin:/bin" "HOME=$WORK/home" "STATE=$STATE" "TOKEN_TMPDIR=$SHM" "BLK=$BLK")
blok_agent=$(sha256sum < "$BLK" | cut -c1-12)
blok_backup=$(sha256sum < "$WORK/blok-backup.txt" | cut -c1-12)
blok_relay=$(sha256sum < "$WORK/blok-relay.txt" | cut -c1-12)

dekode_b64url() { # baca satu segmen JWT dari stdin, tambal padding yang dibuang b64url
  local s
  s=$(cat)
  while [ $(( ${#s} % 4 )) -ne 0 ]; do s+='='; done
  printf '%s' "$s" | tr '_-' '/+' | base64 -d 2>/dev/null
}

uji() { # uji <perintah>; env dari array EV; $0 diset supaya nama berkas cache deterministik
  local cmd=$1
  LAST_OUT=$(env -i PATH="$BIN:/usr/bin:/bin" HOME="$WORK/home" STATE="$STATE" \
    TOKEN_TMPDIR="$SHM" BLK="$BLK" "${EV[@]}" \
    bash -c 'set -euo pipefail; umask 077; source "$BLK"; '"$cmd" pb-under-test 2>"$STATE/err")
  LAST_RC=$?
  LAST_ERR=$(cat "$STATE/err")
}

cek() { # cek <nama> <0=ok> <pesan-gagal>
  if [ "$2" = 0 ]; then
    echo "LULUS $1"; LULUS=$((LULUS + 1))
  else
    echo "GAGAL $1 :: $3"; GAGAL=$((GAGAL + 1))
  fi
}

reset_state() { rm -f "$STATE/argv" "$STATE/cfg" "$STATE/grant" "$SHM"/*; : > "$STATE/argv"; }

echo "===== U. ekstraksi tidak boleh buta: blok non-kosong dan fungsinya memang ada ====="
[ -s "$BLK" ] && grep -q 'get_token()' "$BLK" && [ "$(wc -l < "$BLK")" -ge 40 ]
cek "U blok_terekstrak_non_kosong" $? "baris=$(wc -l < "$BLK") sidik=$blok_agent"

echo "===== A–B. jalur default tidak berubah: token dari metadata, header jadi berkas 600 ====="
EV=(); reset_state
uji 'get_token'
[ "$LAST_RC" = 0 ] && [ "$LAST_OUT" = "palsu-token-metadata" ]
cek "A metadata_sehat" $? "rc=$LAST_RC out=[$LAST_OUT] err=[$LAST_ERR]"
TOK_A=$("${JALUR[@]}" bash -c 'set -euo pipefail; source "$BLK"; get_token' pb-under-test 2>/dev/null)
reset_state
"${JALUR[@]}" bash -c 'set -euo pipefail; umask 077; source "$BLK"; auth_cfg_write "$(get_token)"' pb-under-test 2>"$STATE/err"
rc_cfg=$?
mode_cfg=$(stat -c %a "$CFG" 2>/dev/null || echo TIDAK_ADA)
isi_cfg=$(tr -d '\n' < "$CFG" 2>/dev/null || echo TIDAK_ADA)
[ "$rc_cfg" = 0 ] && [ "$mode_cfg" = 600 ] && [ "$isi_cfg" = "header = \"Authorization: Bearer $TOK_A\"" ]
cek "B berkas_header_600_issu_benar" $? "rc=$rc_cfg mode=$mode_cfg isi=[$isi_cfg] err=[$(cat "$STATE/err")]"

echo "===== C–D. argv buta: token dan assertion tidak muncul di baris perintah ====="
EV=(TOKEN_SOURCE=key "SA_KEY_FILE=$WORK/sa.json"); reset_state
uji 'get_token'
grep -q "palsu-token" "$STATE/argv" && bocor_tok=1 || bocor_tok=0
grep -q "assertion=" "$STATE/argv" && bocor_grant=1 || bocor_grant=0
[ "$LAST_RC" = 0 ] && [ "$LAST_OUT" = "palsu-token-kunci" ] && [ "$bocor_tok" = 0 ] && [ "$bocor_grant" = 0 ]
cek "C argv_buta_token_dan_assertion" $? "rc=$LAST_RC out=[$LAST_OUT] bocor_token=$bocor_tok bocor_assertion=$bocor_grant argv=[$(tr '\n' ' ' < "$STATE/argv")]"
grep -q "oauth2.googleapis.com" "$STATE/argv"
cek "D oauth2_dipanggil_betulan" $? "argv=[$(tr '\n' ' ' < "$STATE/argv")]"

echo "===== E. grant lewat berkas: body utuh dan klaimnya benar ====="
grant=$(cat "$STATE/grant" 2>/dev/null || echo TIDAK_ADA)
assertion=$(printf '%s' "$grant" | sed 's/.*assertion=//')
seg=$(printf '%s' "$assertion" | awk -F. '{print NF}')
alg=$(printf '%s' "$assertion" | cut -d. -f1 | dekode_b64url | jq -r '.alg // empty' 2>/dev/null)
typ=$(printf '%s' "$assertion" | cut -d. -f1 | dekode_b64url | jq -r '.typ // empty' 2>/dev/null)
iss=$(printf '%s' "$assertion" | cut -d. -f2 | dekode_b64url | jq -r '.iss // empty' 2>/dev/null)
scp=$(printf '%s' "$assertion" | cut -d. -f2 | dekode_b64url | jq -r '.scope // empty' 2>/dev/null)
aud=$(printf '%s' "$assertion" | cut -d. -f2 | dekode_b64url | jq -r '.aud // empty' 2>/dev/null)
gt=$(printf '%s' "$grant" | sed 's/&.*//')
[ "$seg" = 3 ] && [ "$alg" = RS256 ] && [ "$typ" = JWT ] && [ "$iss" = "$EMAIL" ] \
  && [ "$scp" = "https://www.googleapis.com/auth/pubsub" ] \
  && [ "$aud" = "https://oauth2.googleapis.com/token" ] \
  && [ "$gt" = "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" ]
cek "E grant_body_iss_scope_aud_alg_benar" $? "segmen=$seg alg=$alg typ=$typ iss=$iss scope=$scp aud=$aud gt=[$gt]"

echo "===== F–G. cache: timer 60 dtk tidak menandatangani ulang tiap tick, simpanan 600 ====="
EV=(TOKEN_SOURCE=key "SA_KEY_FILE=$WORK/sa.json"); reset_state
uji 'get_token >/dev/null; get_token'
panggil=$(grep -c "oauth2.googleapis.com" "$STATE/argv" 2>/dev/null || true)
[ -n "$panggil" ] || panggil=0
[ "$LAST_RC" = 0 ] && [ "$panggil" = 1 ]
cek "F dua_panggilan_satu_pertukaran" $? "pertukaran=$panggil rc=$LAST_RC err=[$LAST_ERR]"
mode_tok=$(stat -c %a "$TOKC" 2>/dev/null || echo TIDAK_ADA)
mode_exp=$(stat -c %a "$TOKC.exp" 2>/dev/null || echo TIDAK_ADA)
[ "$mode_tok" = 600 ] && [ "$mode_exp" = 600 ]
cek "G cache_token_dan_exp_mode_600" $? "token=$mode_tok exp=$mode_exp"

echo "===== H–L. kebutaan yang harus berbunyi dengan sebab bernama ====="
EV=(TOKEN_SOURCE=key); reset_state
uji 'get_token'
printf '%s' "$LAST_ERR" | grep -q "SA_KEY_FILE=KOSONG"
cek "H kunci_kosong_disebut_dengan_nama" $? "err=[$LAST_ERR]"
EV=(TOKEN_SOURCE=key "SA_KEY_FILE=$WORK/tidak-ada.json"); reset_state
uji 'get_token'
printf '%s' "$LAST_ERR" | grep -q "SA_KEY_FILE=$WORK/tidak-ada.json"
cek "I kunci_hilang_menunjuk_path" $? "err=[$LAST_ERR]"
EV=(TOKEN_SOURCE=key "SA_KEY_FILE=$WORK/sa-tanpa-email.json"); reset_state
uji 'get_token'
printf '%s' "$LAST_ERR" | grep -q "client_email"
cek "J kunci_tanpa_client_email" $? "err=[$LAST_ERR]"
EV=(TOKEN_SOURCE=key "SA_KEY_FILE=$WORK/sa-tanpa-key.json"); reset_state
uji 'get_token'
printf '%s' "$LAST_ERR" | grep -q "private_key"
cek "K kunci_tanpa_private_key" $? "err=[$LAST_ERR]"
EV=(TOKEN_SOURCE=kacau); reset_state
uji 'get_token'
printf '%s' "$LAST_ERR" | grep -q "yang dikenal: metadata|key" && [ "$LAST_RC" != 0 ]
cek "L sumber_asing_ditolak" $? "rc=$LAST_RC err=[$LAST_ERR]"

echo "===== M–N. pihak luar menolak: sebab menunjuk alat, bukan angka kosong ====="
EV=(TOKEN_SOURCE=key "SA_KEY_FILE=$WORK/sa.json" 'UJI_OAUTH2_BODY={"error":"invalid_grant","description":"invalid assertion"}'); reset_state
uji 'get_token'
printf '%s' "$LAST_ERR" | grep -q "oauth2 menolak" && [ "$LAST_RC" != 0 ]
cek "M oauth2_menolak_dilaporan_terbaca" $? "rc=$LAST_RC err=[$LAST_ERR]"
EV=(TOKEN_SOURCE=key "SA_KEY_FILE=$WORK/sa.json" UJI_CURL_RC=6); reset_state
uji 'get_token'
printf '%s' "$LAST_ERR" | grep -q "rc=6" && [ "$LAST_RC" != 0 ]
cek "N jaringan_mati_sebut_rc" $? "rc=$LAST_RC err=[$LAST_ERR]"

echo "===== O. token berkarakter berbahaya tidak ditulis ke berkas konfigurasi curl ====="
EV=(UJI_METADATA_BURUK=1); reset_state
uji 'auth_cfg_write "$(get_token)"'
printf '%s' "$LAST_ERR" | grep -q "tidak aman untuk berkas konfigurasi curl" && [ "$LAST_RC" != 0 ]
cek "O token_berkarakter_kutip_ditolak" $? "rc=$LAST_RC err=[$LAST_ERR]"

echo "===== P. blok yang sama di tiga skrip, tidak boleh bercabang diam-diam ====="
[ "$blok_agent" = "$blok_backup" ] && [ "$blok_agent" = "$blok_relay" ]
cek "P blok_identik_agent_backup_relay" $? "agent=$blok_agent backup=$blok_backup relay=$blok_relay"

echo "===== Q–R. statis: nol bearer Google lewat argv, sisi PocketBase tetap terhitung ====="
bocor_static=$(grep -c -H -E '\-H[[:space:]]+"Authorization: Bearer \$' "$AGENT" "$BACKUP" "$RELAY" | awk -F: '{s+=$2} END {print s+0}')
[ "$bocor_static" = 0 ]
cek "Q nol_bearer_google_di_argv" $? "temuan=$bocor_static"
pb_static=$(grep -c -H -E '\-H "Authorization: \$' "$AGENT" "$BACKUP" "$RELAY" | awk -F: '{s+=$2} END {print s+0}')
[ "$pb_static" = 4 ]
cek "R sisa_bearer_pocketbase_terhitung" $? "sisa_bearer_pb=$pb_static (4 = kelas di luar jendela ini: token admin PB, bukan identitas GCP)"

echo "===== S. kontrol negatif dinamis: assertion yang kembali ke argv harus tertangkap ====="
awk 'index($0, "--data-binary \"@$bodyf\"") { print "  resp=$(curl -sS -m 20 -d \"assertion=$jwt.$claims.$sig\" \\"; next } { print }' "$BLK" > "$BLK_MUT"
if ! grep -q 'resp=$(curl -sS -m 20 -d "assertion=' "$BLK_MUT"; then
  echo "GAGAL S mutasi_tidak_mengena :: baris --data-binary tidak ditemukan, gerbang ini buta"
  GAGAL=$((GAGAL + 1))
elif ! bash -n "$BLK_MUT" 2>/dev/null; then
  echo "GAGAL S mutasi_keropa :: hasil mutasi tidak terparse, S akan merah sebab yang salah"
  GAGAL=$((GAGAL + 1))
else
  EV=(); reset_state
  LAST_OUT=$(env -i PATH="$BIN:/usr/bin:/bin" HOME="$WORK/home" STATE="$STATE" TOKEN_TMPDIR="$SHM" \
    TOKEN_SOURCE=key "SA_KEY_FILE=$WORK/sa.json" \
    bash -c 'set -euo pipefail; umask 077; source "$0"; get_token' "$BLK_MUT" 2>/dev/null)
  rc_mut=$?
  grep -q "assertion=" "$STATE/argv" && terdeteksi=1 || terdeteksi=0
  [ "$rc_mut" = 0 ] && [ "$terdeteksi" = 1 ]
  cek "S mutasi_assertion_lewat_argv_ditangkap" $? "rc=$rc_mut terdeteksi=$terdeteksi argv=[$(tr '\n' ' ' < "$STATE/argv")]"
fi

echo "===== T. kontrol negatif statis: --config yang kembali ke -H harus membuat Q merah ====="
mkdir -p "$WORK/mut"
for f in "$AGENT" "$BACKUP" "$RELAY"; do
  awk 'index($0, "--config \"$AUTH_CFG\"") { sub(/--config "\$AUTH_CFG"/, "-H \"Authorization: Bearer $TOKEN\"") } { print }' "$f" > "$WORK/mut/$(basename "$f")"
done
kena=$(grep -c -H -E '\-H[[:space:]]+"Authorization: Bearer \$' "$WORK/mut"/*.sh | awk -F: '{s+=$2} END {print s+0}')
[ "$kena" -ge 3 ]
cek "T bearer_kembali_ke_argv_membuat_Q_merah" $? "temuan_mutasi=$kena (diharapkan >=3: satu per skrip)"

echo "===== V. kontrol negatif aud: pin E harus menolak URI API (buta 2026-10-15, oauth2 menolaknya) ====="
# Kelas kegagalan yang hanya bisa dilihat mesin nyata: aud URI API pernah jadi default di sini,
# oauth2 membalas "Invalid JWT: Failed audience check", dan kasus E tetap hijau karena ia
# meng-assert nilai default yang salah itu. U membuktikan pin E tidak lagi menelan URI API.
awk 'index($0, "TOKEN_AUD=\"${TOKEN_AUD:-https://oauth2.googleapis.com/token}\"") {
       print "TOKEN_AUD=\"${TOKEN_AUD:-https://pubsub.googleapis.com/}\""; next } { print }' "$BLK" > "$BLK_AUD_MUT"
if ! grep -q 'https://pubsub.googleapis.com/}"' "$BLK_AUD_MUT"; then
  echo "GAGAL V mutasi_aud_tidak_mengena :: baris default TOKEN_AUD tidak ditemukan, gerbang ini buta"
  GAGAL=$((GAGAL + 1))
elif ! bash -n "$BLK_AUD_MUT" 2>/dev/null; then
  echo "GAGAL V mutasi_aud_keropa :: hasil mutasi tidak terparse"
  GAGAL=$((GAGAL + 1))
else
  reset_state
  env -i PATH="$BIN:/usr/bin:/bin" HOME="$WORK/home" STATE="$STATE" TOKEN_TMPDIR="$SHM" \
    TOKEN_SOURCE=key "SA_KEY_FILE=$WORK/sa.json" \
    bash -c 'set -euo pipefail; umask 077; source "$0"; get_token' "$BLK_AUD_MUT" >/dev/null 2>&1
  rc_aud=$?
  aud_mut=$(sed 's/.*assertion=//' "$STATE/grant" 2>/dev/null | cut -d. -f2 | dekode_b64url | jq -r '.aud // empty' 2>/dev/null)
  # SAMA seperti pinnnya E: kalau perbandingan ini masih benar untuk URI API, E tidak berguna.
  [ "$rc_aud" = 0 ] && [ "$aud_mut" != "https://oauth2.googleapis.com/token" ]
  cek "V pin_aud_menolak_uri_api_dinamis" $? "rc=$rc_aud aud_terdekode=[$aud_mut]"
fi

echo
echo "===== rekap ====="
echo "blok_sidik=$blok_agent LULUS=$LULUS GAGAL=$GAGAL"
[ "$GAGAL" -eq 0 ]
