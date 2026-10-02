#!/usr/bin/env bash
# Backup konsisten PocketBase Pickertime.
# Snapshot dibuat lewat API /api/backups (SQLite online backup), bukan cp/cold copy,
# supaya data.db tidak tertangkap dalam keadaan setengah ditulis.
#
# VM ini hanya punya OAuth scope devstorage.read_only, jadi hasilnya tidak dikirim
# langsung ke GCS melainkan di-publish ke topic Pub/Sub; agentic-watchdog-vm
# (scope cloud-platform) yang memindahkan file ke bucket.
set -euo pipefail
umask 077

APP_DIR=/opt/pickertime
CONTAINER=pickertime-pocketbase
PROJECT=config-agentic-ubuntu
TOPIC=projects/${PROJECT}/topics/pickertime-pb-backups
LOCAL_KEEP=5
STATE_FILE="$APP_DIR/backup-state.env"

envval() {
  awk -F= -v k="$1" '$1==k { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | head -1
}

PB_EMAIL="$(envval PB_ADMIN_EMAIL)"
PB_PASS="$(envval PB_ADMIN_PASSWORD)"
if [ -z "$PB_EMAIL" ] || [ -z "$PB_PASS" ]; then
  echo "PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD tidak ada di $APP_DIR/.env" >&2
  exit 1
fi

PB_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$CONTAINER")
PB_URL="http://${PB_IP}:8090"

TOKEN=$(curl -fsS -m 30 -X POST "$PB_URL/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$PB_EMAIL\",\"password\":\"$PB_PASS\"}" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  echo "autentikasi superuser gagal" >&2
  exit 1
fi

before=$(curl -fsS -m 30 -H "Authorization: $TOKEN" "$PB_URL/api/backups" | jq -r '.[].key' | sort)
curl -fsS -m 60 -X POST -H "Authorization: $TOKEN" "$PB_URL/api/backups" >/dev/null

KEY=""
for _ in $(seq 1 40); do
  sleep 2
  after=$(curl -fsS -m 30 -H "Authorization: $TOKEN" "$PB_URL/api/backups" | jq -r '.[].key' | sort)
  new=$(comm -13 <(echo "$before") <(echo "$after") | head -1)
  if [ -n "$new" ]; then KEY="$new"; break; fi
done
if [ -z "$KEY" ]; then
  echo "backup baru tidak muncul di /api/backups" >&2
  exit 1
fi

SRC="$APP_DIR/pb_data/backups/$KEY"
[ -f "$SRC" ] || { echo "file backup tidak ditemukan: $SRC" >&2; exit 1; }

SIZE=$(stat -c %s "$SRC")
MD5=$(python3 -c 'import hashlib,base64,sys;print(base64.b64encode(hashlib.md5(open(sys.argv[1],"rb").read()).digest()).decode())' "$SRC")

# Base64 zip ~ratusan KB: tidak boleh lewat argv ("Argument list too long" di bawah
# systemd), jadi body JSON dirakit dari file sementara.
B64F=$(mktemp /tmp/pb-backup-XXXXXX.b64)
BODYF=$(mktemp /tmp/pb-backup-XXXXXX.json)
trap 'rm -f "$B64F" "$BODYF"' EXIT
base64 -w0 "$SRC" | tr -d '\n' > "$B64F"

PS_TOKEN=$(curl -fsS -m 10 -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | jq -r .access_token)

jq -n --arg key "$KEY" --arg md5 "$MD5" --arg size "$SIZE" --rawfile data "$B64F" \
  '{messages:[{data:$data,attributes:{key:$key,md5_b64:$md5,size:$size}}]}' > "$BODYF"

PUB_RESP=$(curl -sS -m 180 -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $PS_TOKEN" -H 'Content-Type: application/json' \
  -d @"$BODYF" "https://pubsub.googleapis.com/v1/${TOPIC}:publish")
PUB_CODE=$(printf '%s' "$PUB_RESP" | tail -n1)
PUB_BODY=$(printf '%s' "$PUB_RESP" | head -n -1)
if [ "$PUB_CODE" != "200" ]; then
  echo "publish ke $TOPIC gagal http=$PUB_CODE body=$(printf '%.400s' "$PUB_BODY")" >&2
  exit 1
fi
MSG_ID=$(printf '%s' "$PUB_BODY" | jq -r '.messageIds[0] // empty')
if [ -z "$MSG_ID" ]; then
  echo "publish ke $TOPIC gagal" >&2
  exit 1
fi

printf 'LAST_OK=%s\nLAST_KEY=%s\nLAST_SIZE=%s\nLAST_MD5=%s\nLAST_MESSAGE_ID=%s\n' \
  "$(date -u +%FT%TZ)" "$KEY" "$SIZE" "$MD5" "$MSG_ID" > "$STATE_FILE"

# Retensi lokal: cadangan di disk VM, terpisah dari retensi 30 hari di bucket GCS.
mapfile -t stale < <(ls -1t "$APP_DIR"/pb_data/backups/*.zip 2>/dev/null | tail -n +$((LOCAL_KEEP + 1)))
for f in "${stale[@]}"; do
  [ -f "$f" ] && rm -f "$f" "${f}.attrs" && echo "buang backup lokal $(basename "$f")"
done

echo "OK $KEY ($SIZE byte, md5 $MD5) -> message $MSG_ID"
