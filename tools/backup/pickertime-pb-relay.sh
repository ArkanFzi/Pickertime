#!/usr/bin/env bash
# Ambil backup PocketBase dari antrean Pub/Sub dan simpan ke bucket GCS.
# Dijalankan di agentic-watchdog-vm (satu-satunya VM dengan scope cloud-platform).
# Pesan hanya di-ack setelah objek terverifikasi ada di bucket, jadi kegagalan
# upload otomatis dicoba lagi pada pull berikutnya.
set -euo pipefail
umask 077

PROJECT=config-agentic-ubuntu
SUB="projects/${PROJECT}/subscriptions/pickertime-pb-backups-to-gcs"
BUCKET=gs://pickertime-pb-backups
STAGE=/opt/pickertime-backups
STATE_FILE="$STAGE/relay-state.env"
mkdir -p "$STAGE"

api() { # api <metode> <path> <body-json> ; cetak body respons, gagal kalau http != 200
  local method=$1 path=$2 payload=$3 out code resp_body
  out=$(curl -sS -m 120 -w '\n%{http_code}' -X "$method" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$payload" "https://pubsub.googleapis.com/v1/${path}")
  code=$(printf '%s' "$out" | tail -n1)
  resp_body=$(printf '%s' "$out" | head -n -1)
  if [ "$code" != "200" ]; then
    echo "http=$code untuk $method $path body=$(printf '%.400s' "$resp_body")" >&2
    return 1
  fi
  printf '%s' "$resp_body"
}

TOKEN=$(curl -fsS -m 10 -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | jq -r .access_token)

RESP=$(api POST "${SUB}:pull" '{"maxMessages":5,"returnImmediately":true}')
N=$(echo "$RESP" | jq -r 'if .receivedMessages then (.receivedMessages | length) else 0 end')
if [ "$N" = "0" ]; then
  echo "tidak ada backup di antrean"
  exit 0
fi
echo "ditarik $N pesan dari antrean"

UPLOADED=0
FAILED=0
for i in $(seq 0 $((N - 1))); do
  ACK=$(echo "$RESP" | jq -r ".receivedMessages[$i].ackId")
  KEY=$(echo "$RESP" | jq -r ".receivedMessages[$i].message.attributes.key // empty")
  WANT_MD5=$(echo "$RESP" | jq -r ".receivedMessages[$i].message.attributes.md5_b64 // empty")
  WANT_SIZE=$(echo "$RESP" | jq -r ".receivedMessages[$i].message.attributes.size // empty")
  if [ -z "$KEY" ] || [ -z "$WANT_MD5" ]; then
    echo "pesan $i tanpa atribut key/md5, dibuang" >&2
    api POST "${SUB}:acknowledge" "$(jq -cn --arg a "$ACK" '{ackIds:[$a]}')" >/dev/null
    FAILED=$((FAILED + 1))
    continue
  fi

  DST="$STAGE/$KEY"
  echo "$RESP" | jq -r ".receivedMessages[$i].message.data" | base64 -d > "$DST"
  GOT_MD5=$(python3 -c 'import hashlib,base64,sys;print(base64.b64encode(hashlib.md5(open(sys.argv[1],"rb").read()).digest()).decode())' "$DST")
  GOT_SIZE=$(stat -c %s "$DST")

  if [ "$GOT_MD5" != "$WANT_MD5" ] || [ "$GOT_SIZE" != "$WANT_SIZE" ]; then
    echo "$KEY rusak di antrean (md5 $GOT_MD5/$WANT_MD5 size $GOT_SIZE/$WANT_SIZE), tidak di-ack" >&2
    rm -f "$DST"
    FAILED=$((FAILED + 1))
    continue
  fi

  URI="$BUCKET/$(date -u +%Y)/$(date -u +%m)/$KEY"
  if ! gcloud storage cp "$DST" "$URI" >/dev/null 2>&1; then
    echo "upload $KEY gagal, tidak di-ack" >&2
    FAILED=$((FAILED + 1))
    continue
  fi
  REMOTE_CRC=$(gcloud storage ls "$URI" --json 2>/dev/null | jq -r '.[0].metadata.crc32c // empty')
  LOCAL_CRC=$(gcloud storage hash "$DST" 2>/dev/null | awk '/crc32c_hash/ {print $2}')
  if [ -z "$REMOTE_CRC" ] || [ "$REMOTE_CRC" != "$LOCAL_CRC" ]; then
    echo "verifikasi remote $URI gagal (crc32c local=$LOCAL_CRC remote=$REMOTE_CRC), tidak di-ack" >&2
    FAILED=$((FAILED + 1))
    continue
  fi

  api POST "${SUB}:acknowledge" "$(jq -cn --arg a "$ACK" '{ackIds:[$a]}')" >/dev/null
  rm -f "$DST"
  printf 'LAST_OK=%s\nLAST_KEY=%s\nLAST_URI=%s\nLAST_SIZE=%s\n' "$(date -u +%FT%TZ)" "$KEY" "$URI" "$GOT_SIZE" > "$STATE_FILE"
  UPLOADED=$((UPLOADED + 1))
  echo "OK $KEY -> $URI"
done

echo "relay selesai: uploaded=$UPLOADED failed=$FAILED"
[ "$FAILED" -eq 0 ]
