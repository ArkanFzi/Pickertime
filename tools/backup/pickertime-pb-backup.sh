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
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/pb_data/backups}"
LOCAL_KEEP="${LOCAL_KEEP:-5}"
LOCAL_MAX="${LOCAL_MAX:-10}"
LEDGER_FILE="${LEDGER_FILE:-$APP_DIR/backup-published.log}"
STATE_FILE="$APP_DIR/backup-state.env"

AGENT_UNIT="${AGENT_UNIT:-pickertime-pb-agent.service}"
AGENT_WAIT="${AGENT_WAIT:-120}"

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

agent_active() {
  local s
  s=$(systemctl is-active --value "$AGENT_UNIT" 2>/dev/null || true)
  case "$s" in
    active | activating | reloading | refreshing) return 0 ;;
    *) return 1 ;;
  esac
}

# Tick agen yang sedang apply jangan dibunuh: apply setengah jalan berarti berkas baru sudah
# terpasang tapi container belum restart. Timer agen sudah berhenti di ExecStartPre, jadi yang
# tersisa tinggal tick yang terlanjur jalan — ditunggu, bukan distop.
for _ in $(seq 1 "$AGENT_WAIT"); do
  agent_active || break
  sleep 1
done
if agent_active; then
  echo "waspada: tick agen masih jalan setelah ${AGENT_WAIT} dtk, snapshot tetap dijalankan"
fi

envval() {
  awk -F= -v k="$1" '$1==k { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | head -1
}

ledger_has() { grep -qxF "$(basename "$1")" "$LEDGER_FILE" 2>/dev/null; }

# Retensi dibungkus fungsi supaya harness scratch menjalankan byte yang sama dengan yang
# terpasang di produksi; lubang CFG-62 lahir justru dari blok yang tidak bisa diuji terpisah.
apply_retention() {
  local f b victim note n n2
  local -a stale
  if [ ! -f "$LEDGER_FILE" ]; then
    echo "waspada: ledger offload tidak ada di $LEDGER_FILE, kuota tidak bisa membedakan yatim"
  fi

  # Kuota harian: yang tidak tercatat membalas 200 saat publish ditahan, bukan dibuang.
  mapfile -t stale < <(ls -1t "$BACKUP_DIR"/*.zip 2>/dev/null | tail -n +$((LOCAL_KEEP + 1)))
  for f in "${stale[@]}"; do
    [ -f "$f" ] || continue
    b=$(basename "$f")
    if ledger_has "$f"; then
      rm -f "$f" "${f}.attrs" && echo "buang backup lokal $b (terpublish, kuota $LOCAL_KEEP)"
    else
      echo "waspada: $b tidak tercatat terpublish, ditahan dari kuota $LOCAL_KEEP"
    fi
  done

  # Langit-langit keras. Tanpa ini ledger yang hilang membuat retensi jadi no-op dan disk
  # tumbuh tanpa batas; yatim hanya tersentuh kalau tidak ada lagi yang terpublikasi.
  while :; do
    n=$(ls -1 "$BACKUP_DIR"/*.zip 2>/dev/null | wc -l)
    [ "$n" -le "$LOCAL_MAX" ] && break
    victim=$(ls -1tr "$BACKUP_DIR"/*.zip 2>/dev/null | while IFS= read -r f; do
      ledger_has "$f" && echo "$f"
    done | head -n1)
    note="terpublish"
    if [ -z "$victim" ]; then
      victim=$(ls -1tr "$BACKUP_DIR"/*.zip 2>/dev/null | head -n1)
      [ -n "$victim" ] || break
      note="yatim"
    fi
    b=$(basename "$victim")
    rm -f "$victim" "${victim}.attrs"
    n2=$(ls -1 "$BACKUP_DIR"/*.zip 2>/dev/null | wc -l)
    if [ "$n2" -ge "$n" ]; then
      echo "waspada: langit-langit $LOCAL_MAX gagal ditegakkan, $b tidak benar-benar terhapus"
      break
    fi
    if [ "$note" = "yatim" ]; then
      echo "waspada: langit-langit $LOCAL_MAX memaksa yatim tertua $b dibuang padahal offload-nya tidak tercatat"
    fi
    echo "buang backup lokal $b ($note, langit-langit $LOCAL_MAX)"
  done
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

SRC="$BACKUP_DIR/$KEY"
[ -f "$SRC" ] || { echo "file backup tidak ditemukan: $SRC" >&2; exit 1; }
# zip + sidecar .attrs dibuat PocketBase di dalam kontainer (root, umask 0022) lewat
# bind mount, jadi `umask 077` di baris 10 tidak pernah menyasar berkas ini.
chmod 600 "$SRC"
if [ -f "$SRC.attrs" ]; then chmod 600 "$SRC.attrs"; fi

SIZE=$(stat -c %s "$SRC")
MD5=$(python3 -c 'import hashlib,base64,sys;print(base64.b64encode(hashlib.md5(open(sys.argv[1],"rb").read()).digest()).decode())' "$SRC")

# Base64 zip ~ratusan KB: tidak boleh lewat argv ("Argument list too long" di bawah
# systemd), jadi body JSON dirakit dari file sementara.
B64F=$(mktemp /tmp/pb-backup-XXXXXX.b64)
BODYF=$(mktemp /tmp/pb-backup-XXXXXX.json)
trap 'rm -f "$B64F" "$BODYF" "$AUTH_CFG"' EXIT
base64 -w0 "$SRC" | tr -d '\n' > "$B64F"

PS_TOKEN=$(get_token) || exit 1
[ -n "$PS_TOKEN" ] || { echo "token: sumber $TOKEN_SOURCE mengembalikan token kosong" >&2; exit 1; }
auth_cfg_write "$PS_TOKEN" || exit 1

jq -n --arg key "$KEY" --arg md5 "$MD5" --arg size "$SIZE" --rawfile data "$B64F" \
  '{messages:[{data:$data,attributes:{key:$key,md5_b64:$md5,size:$size}}]}' > "$BODYF"

PUB_RESP=$(curl -sS -m 180 -w '\n%{http_code}' -X POST \
  --config "$AUTH_CFG" -H 'Content-Type: application/json' \
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

# Ledger append-only: satu baris per KEY yang publish-nya benar-benar membalas 200.
# state.env ditimpa tiap jalan jadi tidak bisa dipakai sebagai riwayat; tanpa berkas ini
# retensi tidak bisa membedakan "sudah di relay" dan "mati sebelum publish" (CFG-62).
printf '%s\n' "$KEY" >> "$LEDGER_FILE"

# Retensi lokal: cadangan di disk VM, terpisah dari retensi 30 hari di bucket GCS.
apply_retention

echo "OK $KEY ($SIZE byte, md5 $MD5) -> message $MSG_ID"
