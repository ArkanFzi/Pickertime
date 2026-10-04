#!/usr/bin/env bash
# Agen deploy di VM produksi (jalan sebagai root, ditarik systemd timer).
#
# Kenapa pull-based: VM ini pakai kunci SSH metadata lama dan tanpa OS Login, jadi
# service account CI tidak punya jalur login. Corbanya dibalik — CI tidak pernah
# masuk ke VM, VM yang mengambil perintah dari antrean miliknya sendiri.
# Kredensial superuser PocketBase tidak pernah keluar dari VM ini.
#
# Perintah yang diterima (JSON di Pub/Sub):
#   {"deploy_id":"...","action":"apply","object":"inbox/<file>.tar",
#    "sha256":"<64 hex>","size":<byte>}
#   {"deploy_id":"...","action":"rollback","snapshot":"<deploy_id>"}
# Hasil dibalas ke topic pickertime-pb-deploy-results; pesan hanya di-ack setelah
# hasil terbit, jadi kegagalan sementara dicoba lagi pada tick berikutnya.
set -euo pipefail
umask 077

PROJECT="${PROJECT:-config-agentic-ubuntu}"
SUB="projects/${PROJECT}/subscriptions/pickertime-pb-deploy-to-vm"
RESULTS_TOPIC="projects/${PROJECT}/topics/pickertime-pb-deploy-results"
BUCKET_NAME="${BUCKET_NAME:-pickertime-pb-deploys}"
APP_DIR=/opt/pickertime
REMOTE_APP="$APP_DIR/app"
RELEASES="$APP_DIR/releases"
CONTAINER=pickertime-pocketbase
STATE_DIR=/var/lib/pickertime-deploy
STATE_FILE="$STATE_DIR/state.env"
MAX_BYTES=20971520
LOG_PREFIX="agent"

ACK=''
ID=''

api() { # api <metode> <path> <body> -> body respons; gagal kalau http != 200
  local method=$1 path=$2 payload=$3 out code body
  out=$(curl -sS -m 60 -w '\n%{http_code}' -X "$method" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$payload" "https://pubsub.googleapis.com/v1/${path}")
  code=$(printf '%s' "$out" | tail -n1)
  body=$(printf '%s' "$out" | head -n -1)
  if [ "$code" != "200" ]; then
    echo "$LOG_PREFIX: http=$code untuk $method $path body=$(printf '%.300s' "$body")" >&2
    return 1
  fi
  printf '%s' "$body"
}

write_state() { printf 'LAST_ID=%s\nLAST_STATUS=%s\n' "$1" "$2" > "$STATE_FILE"; }

publish_result() {
  local b64
  b64=$(base64 -w0 "$STATE_DIR/result.json" | tr -d '\n')
  api POST "${RESULTS_TOPIC}:publish" "$(jq -cn --arg d "$b64" '{messages:[{data:$d}]}')" >/dev/null
}

finish() { # finish <deploy_id> <status> <pesan> -> tulis hasil, balas, ack, keluar 0
  local st=$1 msg=$2
  jq -cn --arg id "$ID" --arg st "$st" --arg m "$msg" \
    '{deploy_id:$id,status:$st,message:$m}' > "$STATE_DIR/result.json"
  if ! publish_result; then
    echo "$LOG_PREFIX: $ID hasil gagal terbit, pesan tidak di-ack" >&2
    exit 1
  fi
  write_state "$ID" "$st"
  if [ -n "${WORK:-}" ] && [ -d "$RELEASES/$ID" ]; then
    cp "$STATE_DIR/result.json" "$RELEASES/$ID/.result.json"
  fi
  api POST "${SUB}:acknowledge" "$(jq -cn --arg a "$ACK" '{ackIds:[$a]}')" >/dev/null || {
    echo "$LOG_PREFIX: $ID gagal ack, hasil sudah terbit (redelivery akan dideduplikasi)" >&2
  }
  rm -rf "${WORK:-}"
  echo "$LOG_PREFIX: $ID $st"
  exit 0
}

#   die  = kegagalan terminal: hasil dibalas, pesan di-ack (pesan rusak tidak diulang selamanya)
#   bail = kegagalan sementara: TIDAK di-ack, redelivery mencoba lagi
die() {
  echo "$LOG_PREFIX: $ID GAGAL $*" >&2
  write_state "${ID:-?}" failed
  jq -cn --arg id "$ID" --arg m "$*" '{deploy_id:$id,status:"failed",message:$m}' \
    > "$STATE_DIR/result.json"
  if ! publish_result; then
    echo "$LOG_PREFIX: $ID hasil gagal terbit, pesan tidak di-ack" >&2
    exit 1
  fi
  api POST "${SUB}:acknowledge" "$(jq -cn --arg a "$ACK" '{ackIds:[$a]}')" >/dev/null || true
  exit 1
}
bail() { echo "$LOG_PREFIX: ${ID:-?} BAIL $*" >&2; exit 1; }
step() { echo "$LOG_PREFIX: ${ID:-?} langkah: $*"; }

pb_ip() { docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$CONTAINER"; }

gate() { # gerbang lokal: health + anon harus 401 + superuser auth + baca koleksi
  local url="http://${1}:8090" code tok eml pw c
  code=$(curl -s -o "$WORK/health.json" -w '%{http_code}' -m 15 "$url/api/health") || { echo "health curl gagal"; return 1; }
  [ "$code" = "200" ] || { echo "health http=$code"; return 1; }
  grep -q '"code":200' "$WORK/health.json" || { echo "health body bukan 200"; return 1; }
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST -H 'Content-Type: application/json' \
    -d '{"prompt":"ping"}' "$url/api/ai/gemini") || { echo "anon gemini curl gagal"; return 1; }
  [ "$code" = "401" ] || { echo "anon /api/ai/gemini http=$code (harus 401)"; return 1; }
  eml=$(sed -n 's/^email=//p' "$APP_DIR/superuser.txt") || { echo "baca superuser.txt gagal"; return 1; }
  pw=$(sed -n 's/^password=//p' "$APP_DIR/superuser.txt") || { echo "baca superuser.txt gagal"; return 1; }
  [ -n "$eml" ] && [ -n "$pw" ] || { echo "kredensial superuser tidak terbaca"; return 1; }
  tok=$(curl -sS -m 15 -X POST -H 'Content-Type: application/json' \
    -d "$(jq -n --arg i "$eml" --arg p "$pw" '{identity:$i,password:$p}')" \
    "$url/api/collections/_superusers/auth-with-password" | jq -r '.token // empty') || { echo "auth curl/jq gagal"; return 1; }
  [ -n "$tok" ] || { echo "autentikasi superuser gagal"; return 1; }
  for c in Profiles Tasks Focus_Sessions Workspace_Events; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -H "Authorization: $tok" "$url/api/collections/$c") || { echo "GET /api/collections/$c curl gagal"; return 1; }
    [ "$code" = "200" ] || { echo "GET /api/collections/$c http=$code"; return 1; }
  done
  return 0
}

gate_wait() { # coba gerbang sampai container selesai boot; cetak pesan kegagalan terakhir
  local deadline=$(( $(date +%s) + ${2:-60} )) out
  while :; do
    if out=$(gate "$(pb_ip)" 2>&1); then return 0; fi
    [ "$(date +%s)" -lt "$deadline" ] || { printf '%s\n' "${out:-gerbang merah}" >&2; return 1; }
    sleep 3
  done
}

do_restart() {
  local state
  docker restart "$CONTAINER" >/dev/null
  local deadline=$(( $(date +%s) + 60 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    state=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo gone)
    [ "$state" = "running" ] && return 0
    sleep 1
  done
  return 1
}

restore() { # restore <alasan> — ganti pasangan direktori dengan baseline, bukan menimpa sebagian
  local why="$1" snap="$RELEASES/$ID"
  if [ ! -f "$snap/.deploy-baseline.tar" ]; then
    echo "$LOG_PREFIX: $ID tidak ada baseline untuk restore ($why)" >&2
    return 1
  fi
  mv "$REMOTE_APP/pb_hooks" "$REMOTE_APP/pb_hooks.rolledback-$ID" 2>/dev/null || true
  mv "$REMOTE_APP/pb_migrations" "$REMOTE_APP/pb_migrations.rolledback-$ID" 2>/dev/null || true
  tar -xf "$snap/.deploy-baseline.tar" -C "$REMOTE_APP"
  do_restart || true
  echo "$LOG_PREFIX: $ID restored ($why)"
}

apply_deploy() {
  local object=$1 sha=$2 size=$3 enc http got_sha got_size
  if [ -f "$RELEASES/$ID/.result.json" ]; then
    cp "$RELEASES/$ID/.result.json" "$STATE_DIR/result.json"
    if ! publish_result; then bail "hasil duplikat gagal terbit"; fi
    api POST "${SUB}:acknowledge" "$(jq -cn --arg a "$ACK" '{ackIds:[$a]}')" >/dev/null || true
    echo "$LOG_PREFIX: $ID sudah pernah dipasang, hasil lama dibalas ulang"
    exit 0
  fi

  echo "$LOG_PREFIX: $ID ambil $object"
  # Unduh lewat REST + token metadata ($TOKEN): tidak bergantung pada konfigurasi
  # gcloud milik root, dan tetap di dalam scope devstorage.read_only.
  enc=$(printf '%s' "$object" | jq -sRr '@uri')
  http=$(curl -sS -o "$WORK/artifact.tar" -w '%{http_code}' -m 120 \
    -H "Authorization: Bearer $TOKEN" \
    "https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}/o/${enc}?alt=media") || bail "unduh error"
  case "$http" in
    200) : ;;
    429 | 500 | 502 | 503 | 504) bail "unduh http=$http (sementara)" ;;
    *) die "unduh http=$http untuk $object" ;;
  esac
  got_sha=$(sha256sum "$WORK/artifact.tar" | awk '{print $1}')
  got_size=$(stat -c %s "$WORK/artifact.tar")
  [ "$got_sha" = "$sha" ] || die "sha256 tidak cocok ($got_sha)"
  [ "$got_size" = "$size" ] || die "size tidak cocok ($got_size)"

  # Isi arsip: hanya berkas biasa di bawah pb_hooks/ atau pb_migrations/, plus manifest.
  # Tidak ada path absolut, tidak ada "..", tidak ada symlink/device, tidak ada direktori
  # telanjang. Penerbit (publish-pb-deploy.sh) yang membangun arsip dengan bentuk ini.
  # Sengaja grep -E, bukan awk: mawk 1.3.4 di mesin ini menolak escape '\/'.
  tar -tf "$WORK/artifact.tar" > "$WORK/listing.txt"
  [ -s "$WORK/listing.txt" ] || die "arsip kosong"
  if grep -qE '^/|(^|/)\.\.(/|$)|^\.|^$' "$WORK/listing.txt"; then die "arsip mengandung path berisiko"; fi
  if grep -qvE '^pb_hooks/[^/]+|^pb_migrations/|^DEPLOY-MANIFEST\.sha256$' "$WORK/listing.txt"; then
    die "arsip mengandung entri di luar pb_hooks/pb_migrations"
  fi
  if tar -tvf "$WORK/artifact.tar" | awk '{ if ($1 !~ /^[-]/) bad = 1 } END { exit bad ? 1 : 0 }'; then
    :
  else
    die "arsip mengandung direktori/symlink/device"
  fi

  mkdir -p "$WORK/stage" "$WORK/stage/pb_hooks" "$WORK/stage/pb_migrations"
  tar -xf "$WORK/artifact.tar" -C "$WORK/stage"
  [ -f "$WORK/stage/DEPLOY-MANIFEST.sha256" ] || die "DEPLOY-MANIFEST.sha256 tidak ada"
  (cd "$WORK/stage" && sha256sum -c DEPLOY-MANIFEST.sha256 --status) || die "manifest isi tidak cocok"

  # Gerbang dulu, baru sentuh apa pun. Kalau produksi sudah merah sebelum deploy,
  # memaksakan restart + rollback hanya menutupi penyebab yang sebenarnya.
  step "gerbang pra-pasang (VM belum diubah)"
  gate "$(pb_ip)" || die "gerbang merah SEBELUM ada perubahan, deploy dibatalkan"

  step "snapshot baseline"
  mkdir -p "$RELEASES/$ID"
  tar -cf "$RELEASES/$ID/.deploy-baseline.tar" -C "$REMOTE_APP" pb_hooks pb_migrations
  cp "$WORK/stage/DEPLOY-MANIFEST.sha256" "$RELEASES/$ID/DEPLOY-MANIFEST.sha256"
  date -u +%FT%TZ > "$RELEASES/$ID/applied_at"

  step "rsync pb_hooks + pb_migrations (aditif, tanpa --delete)"
  rsync -a "$WORK/stage/pb_hooks/" "$REMOTE_APP/pb_hooks/"
  rsync -a "$WORK/stage/pb_migrations/" "$REMOTE_APP/pb_migrations/"

  step "restart container"
  if ! do_restart; then
    if ! restore "container tidak kembali running"; then die "container mati dan baseline tidak ada"; fi
    die "restart gagal, state dikembalikan"
  fi
  step "gerbang pasca-pasang"
  if ! gate_wait; then
    if ! restore "gerbang merah setelah pasang"; then die "gerbang merah dan baseline tidak ada"; fi
    die "gerbang merah setelah pasang, state dikembalikan"
  fi
  finish applied "health+anon-401+superuser+4 koleksi hijau"
}

rollback_deploy() {
  local target
  target=$(printf '%s' "$MSG" | jq -r '.snapshot // empty')
  case "$target" in
    '' | *[!A-Za-z0-9._-]*) die "snapshot tidak valid: '$target'" ;;
  esac
  [ -f "$RELEASES/$target/.deploy-baseline.tar" ] || die "snapshot tidak ada: $target"
  # ID sudah di-set dari pesan (rb-<snapshot>), jangan override
  mv "$REMOTE_APP/pb_hooks" "$REMOTE_APP/pb_hooks.rolledback-$ID" 2>/dev/null || true
  mv "$REMOTE_APP/pb_migrations" "$REMOTE_APP/pb_migrations.rolledback-$ID" 2>/dev/null || true
  tar -xf "$RELEASES/$target/.deploy-baseline.tar" -C "$REMOTE_APP"
  do_restart || die "restart gagal setelah rollback"
  gate_wait || die "gerbang merah setelah rollback"
  finish rolled_back "kembali ke snapshot $target"
}

mkdir -p "$STATE_DIR" "$RELEASES"
TOKEN=$(curl -fsS -m 10 -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | jq -r .access_token)

RESP=$(api POST "${SUB}:pull" '{"maxMessages":1,"returnImmediately":true}') || bail "pull gagal"
N=$(printf '%s' "$RESP" | jq -r 'if .receivedMessages then (.receivedMessages|length) else 0 end')
if [ "$N" = "0" ]; then echo "$LOG_PREFIX: antrean kosong"; exit 0; fi

ACK=$(printf '%s' "$RESP" | jq -r '.receivedMessages[0].ackId')
MSG=$(printf '%s' "$RESP" | jq -r '.receivedMessages[0].message.data' | base64 -d) \
  || die "base64 pesan rusak"
if ! printf '%s' "$MSG" | jq -e . >/dev/null 2>&1; then die "pesan bukan JSON valid"; fi

ID=$(printf '%s' "$MSG" | jq -r '.deploy_id // empty')
ACTION=$(printf '%s' "$MSG" | jq -r '.action // "apply"')
OBJECT=$(printf '%s' "$MSG" | jq -r '.object // empty')
SHA=$(printf '%s' "$MSG" | jq -r '.sha256 // empty')
SIZE=$(printf '%s' "$MSG" | jq -r '.size // empty')

# deploy_id masuk ke nama path, jadi pola ketat ini yang mencegah traversal/penyuntikan.
case "$ID" in
  '' | *[!A-Za-z0-9._-]*) die "deploy_id tidak valid: '$ID'" ;;
esac
[ "${#ID}" -le 64 ] || die "deploy_id terlalu panjang (${#ID})"

if [ "$ACTION" = "apply" ]; then
  printf '%s' "$OBJECT" | grep -qE '^inbox/[A-Za-z0-9._-]+\.tar$' || die "objek harus inbox/<nama>.tar: '$OBJECT'"
  printf '%s' "$SHA" | grep -qE '^[a-f0-9]{64}$' || die "sha256 tidak berbentuk: '$SHA'"
  printf '%s' "$SIZE" | grep -qE '^[0-9]+$' || die "size bukan angka: '$SIZE'"
  [ "$SIZE" -le "$MAX_BYTES" ] || die "artefak terlalu besar: $SIZE byte (maks $MAX_BYTES)"
fi

WORK="$STATE_DIR/work-$ID"
rm -rf "$WORK"
mkdir -p "$WORK"

case "$ACTION" in
  apply) apply_deploy "$OBJECT" "$SHA" "$SIZE" ;;
  rollback) rollback_deploy ;;
  *) die "action tak dikenal: $ACTION" ;;
esac
