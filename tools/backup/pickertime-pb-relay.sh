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

# === SUMBER TOKEN (metadata | key) === [BEGIN]
# Dua sumber kredensial, dipilih lewat env supaya rollback cukup satu baris di unit
# (`Environment=TOKEN_SOURCE=metadata`) dan tidak ada jalur lain yang ikut berubah:
#
#   metadata  = identitas yang dilekatkan ke VM. Ini keadaan hari ini, dan identitas itu
#               dual-sided: pegang subscriber DAN publisher pada resource yang sama (CFG-20).
#   key       = kunci service account sempit di SA_KEY_FILE (root:root 600), ditukar jadi
#               akses token lewat JWT bearer grant tanpa dependensi gcloud.
#
# Kenapa token tidak boleh lagi lewat argv: `ps -eo args` terbaca dari host oleh uid 1000
# (kontainer otak jalan di host yang sama), jadi bearer yang muncul di argumen curl bisa
# dicuri dan dipakai dari proses mana pun — itu memindahkan kebocoran, bukan menutupnya.
# Header Authorization dibaca curl dari berkas konfigurasi 600, dan body grant ditulis ke
# berkas, bukan disisipkan ke baris perintah.
TOKEN_SOURCE="${TOKEN_SOURCE:-metadata}"
SA_KEY_FILE="${SA_KEY_FILE:-}"
# aud = URI endpoint token, bukan URI API: terukur 2026-10-15 aud=.../pubsub.googleapis.com/
# ditolak oauth2 dengan "Invalid JWT: Failed audience check" walau bentuknya masuk akal.
TOKEN_AUD="${TOKEN_AUD:-https://oauth2.googleapis.com/token}"
TOKEN_SCOPE="${TOKEN_SCOPE:-https://www.googleapis.com/auth/pubsub}"
TOKEN_TMPDIR="${TOKEN_TMPDIR:-/dev/shm}"
TOKEN_TAG=$(basename "$0" .sh | sed 's/^pickertime-//')
TOKEN_CACHE="${TOKEN_TMPDIR}/${TOKEN_TAG}-token"
AUTH_CFG="${TOKEN_TMPDIR}/${TOKEN_TAG}-authcfg"

b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }

auth_cfg_write() { # tulis header ke berkas 600; nilai token tidak pernah jadi argumen
  local t=${1:-}
  [ -n "$t" ] || { echo "token: kosong, tidak ditulis ke berkas konfigurasi" >&2; return 1; }
  case "$t" in
    *'"'* | *'\'*) echo "token: mengandung karakter yang tidak aman untuk berkas konfigurasi curl" >&2; return 1 ;;
  esac
  umask 077
  printf 'header = "Authorization: Bearer %s"\n' "$t" > "$AUTH_CFG" || return 1
  chmod 600 "$AUTH_CFG"
}

token_from_key() { # kunci SA -> JWT -> akses token; hasil disimpan di tmpfs 600 + kedaluwarsa
  local now exp email jwt claims sig keyf bodyf resp rc=0 tok ttl grant
  if [ -z "$SA_KEY_FILE" ] || [ ! -r "$SA_KEY_FILE" ]; then
    echo "token: TOKEN_SOURCE=key tapi kunci tidak terbaca (SA_KEY_FILE=${SA_KEY_FILE:-KOSONG})" >&2
    return 1
  fi
  now=$(date +%s)
  if [ -r "$TOKEN_CACHE" ] && [ -r "$TOKEN_CACHE.exp" ]; then
    exp=$(cat "$TOKEN_CACHE.exp" 2>/dev/null || echo 0)
    if [ "${exp:-0}" -gt $((now + 300)) ]; then cat "$TOKEN_CACHE"; return 0; fi
  fi
  email=$(jq -r '.client_email // empty' "$SA_KEY_FILE" 2>/dev/null || true)
  [ -n "$email" ] || { echo "token: kunci tanpa client_email di $SA_KEY_FILE" >&2; return 1; }
  keyf=$(mktemp "${TOKEN_TMPDIR}/pb-key-XXXXXX.pem")
  if ! jq -r '.private_key // empty' "$SA_KEY_FILE" > "$keyf" 2>/dev/null || [ ! -s "$keyf" ]; then
    rm -f "$keyf"
    echo "token: kunci tanpa private_key di $SA_KEY_FILE" >&2
    return 1
  fi
  jwt=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
  claims=$(jq -cn --arg iss "$email" --arg scope "$TOKEN_SCOPE" --arg aud "$TOKEN_AUD" \
    --argjson iat "$now" --argjson exp "$((now + 3600))" \
    '{iss:$iss,scope:$scope,aud:$aud,iat:$iat,exp:$exp}' | b64url)
  sig=$(printf '%s.%s' "$jwt" "$claims" | openssl dgst -sha256 -sign "$keyf" 2>/dev/null | b64url)
  rm -f "$keyf"
  [ -n "$sig" ] || { echo "token: openssl gagal menandatangani JWT dengan kunci di $SA_KEY_FILE" >&2; return 1; }
  bodyf=$(mktemp "${TOKEN_TMPDIR}/pb-grant-XXXXXX.form")
  grant='grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer'
  printf '%s&assertion=%s.%s.%s' "$grant" "$jwt" "$claims" "$sig" > "$bodyf"
  resp=$(curl -sS -m 20 --data-binary "@$bodyf" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    https://oauth2.googleapis.com/token 2>/dev/null) || rc=$?
  rm -f "$bodyf"
  if [ "$rc" != 0 ]; then
    echo "token: pertukaran JWT ke oauth2.googleapis.com gagal rc=$rc (jaringan mati?)" >&2
    return 1
  fi
  tok=$(printf '%s' "$resp" | jq -r '.access_token // empty' 2>/dev/null || true)
  [ -n "$tok" ] || { echo "token: oauth2 menolak — $(printf '%.200s' "$resp")" >&2; return 1; }
  ttl=$(printf '%s' "$resp" | jq -r '.expires_in // 3600' 2>/dev/null || true)
  case "$ttl" in '' | *[!0-9]*) ttl=3600 ;; esac
  umask 077
  printf '%s' "$tok" > "$TOKEN_CACHE" && chmod 600 "$TOKEN_CACHE"
  printf '%s' "$((now + ttl))" > "$TOKEN_CACHE.exp" && chmod 600 "$TOKEN_CACHE.exp"
  printf '%s' "$tok"
}

get_token() {
  case "$TOKEN_SOURCE" in
    metadata)
      curl -fsS -m 10 -H 'Metadata-Flavor: Google' \
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' \
        | jq -r '.access_token // empty' ;;
    key) token_from_key ;;
    *) echo "token: TOKEN_SOURCE tak dikenal: $TOKEN_SOURCE (yang dikenal: metadata|key)" >&2; return 1 ;;
  esac
}
# === SUMBER TOKEN (metadata | key) === [END]

api() { # api <metode> <path> <body-json> ; cetak body respons, gagal kalau http != 200
  local method=$1 path=$2 payload=$3 out code resp_body
  out=$(curl -sS -m 120 -w '\n%{http_code}' -X "$method" \
    --config "$AUTH_CFG" -H 'Content-Type: application/json' \
    -d "$payload" "https://pubsub.googleapis.com/v1/${path}")
  code=$(printf '%s' "$out" | tail -n1)
  resp_body=$(printf '%s' "$out" | head -n -1)
  if [ "$code" != "200" ]; then
    echo "http=$code untuk $method $path body=$(printf '%.400s' "$resp_body")" >&2
    return 1
  fi
  printf '%s' "$resp_body"
}

TOKEN=$(get_token) || exit 1
[ -n "$TOKEN" ] || { echo "token: sumber $TOKEN_SOURCE mengembalikan token kosong" >&2; exit 1; }
auth_cfg_write "$TOKEN" || exit 1
trap 'rm -f "$AUTH_CFG"' EXIT

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
