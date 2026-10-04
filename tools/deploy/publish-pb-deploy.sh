#!/usr/bin/env bash
# Terbitkan perintah deploy ke antrean VM, lalu tunggu hasilnya.
# Dipakai oleh .github/workflows/deploy.yml (di GHA) dan bisa dijalankan manual dari
# laptop dengan kredensial ADC yang sama.
#
# Kenapa bukan SSH: lihat kepala pickertime-pb-agent.sh — VM tidak punya jalur login
# untuk service account CI. Arahnya dibalik: CI menulis perintah, VM yang menarik.
#
# Persyaratan yang diasumsikan sudah ada (dibuat 2026-10-02, lihat TODO.md M4.3):
#   bucket   gs://pickertime-pb-deploys
#   topic    projects/<PROJECT>/topics/pickertime-pb-deploy
#   topic    projects/<PROJECT>/topics/pickertime-pb-deploy-results
#   sub      projects/<PROJECT>/subscriptions/pickertime-pb-deploy-results-to-gha
#
# Pemakaian:
#   publish-pb-deploy.sh                 # dry-run: bangun artefak, cetak manifest, tidak mengunggah
#   publish-pb-deploy.sh --apply         # apply ke VM
#   publish-pb-deploy.sh --apply --rollback <deploy_id>
set -euo pipefail

PROJECT="${PROJECT:-config-agentic-ubuntu}"
BUCKET_NAME="${BUCKET_NAME:-pickertime-pb-deploys}"
TOPIC="projects/${PROJECT}/topics/pickertime-pb-deploy"
RESULTS_SUB="projects/${PROJECT}/subscriptions/pickertime-pb-deploy-results-to-gha"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
DEADLINE_SEC="${DEADLINE_SEC:-900}"

APPLY=0
ROLLBACK_TO=''
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --rollback) ROLLBACK_TO='@next@' ;;
    *)
      if [ "$ROLLBACK_TO" = '@next@' ]; then ROLLBACK_TO="$a"; else echo "argumen tak dikenal: $a" >&2; exit 2; fi
      ;;
  esac
done
[ "$ROLLBACK_TO" != '@next@' ] || { echo "--rollback butuh <deploy_id>" >&2; exit 2; }

RUN_ID="${GITHUB_RUN_ID:-manual-$$}"
SHA_SHORT="$(git -C "$REPO_ROOT" rev-parse --short=8 HEAD 2>/dev/null || echo nogit)"
case "$RUN_ID" in *[!A-Za-z0-9._-]*|'') RUN_ID="t$(date +%s)" ;; esac
if [ -n "$ROLLBACK_TO" ]; then
  case "$ROLLBACK_TO" in *[!A-Za-z0-9._-]*|'') echo "snapshot tidak valid: '$ROLLBACK_TO'" >&2; exit 2 ;; esac
  DEPLOY_ID="rb-${ROLLBACK_TO}"
else
  DEPLOY_ID="run-${RUN_ID}-${SHA_SHORT}"
fi
[ "${#DEPLOY_ID}" -le 64 ] || { echo "deploy_id terlalu panjang (${#DEPLOY_ID})" >&2; exit 2; }

WORK="$(mktemp -d /tmp/pb-deploy-publish-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/stage"

build_artifact() {
  mkdir -p "$STAGE/pb_hooks" "$STAGE/pb_migrations"
  # Hanya berkas biasa; nama path relatif terhadap akar repo, urut, mode dinormalisasi,
  # supaya isi arsip deterministik dan mudah diaudit oleh agen di VM.
  ( cd "$REPO_ROOT" && find pb_hooks pb_migrations -type f -print0 | LC_ALL=C sort -z ) > "$WORK/files0"
  while IFS= read -r -d '' f; do
    install -D -m 0644 "$REPO_ROOT/$f" "$STAGE/$f"
  done < "$WORK/files0"
  ( cd "$STAGE" && find pb_hooks pb_migrations -type f | LC_ALL=C sort | xargs -r sha256sum ) \
    > "$STAGE/DEPLOY-MANIFEST.sha256"
  ( cd "$STAGE" && find pb_hooks pb_migrations -type f | LC_ALL=C sort; echo DEPLOY-MANIFEST.sha256 ) > "$WORK/tar-list"
  tar --no-recursion --sort=name --format=ustar --owner=0 --group=0 --mode=0644 \
    -cf "$WORK/artifact.tar" -C "$STAGE" -T "$WORK/tar-list"
  sha256sum "$WORK/artifact.tar" | awk '{print $1}' > "$WORK/sha"
  stat -c %s "$WORK/artifact.tar" | awk '{print $1}' > "$WORK/size"
}

if [ -n "$ROLLBACK_TO" ]; then
  ACTION='rollback'; OBJECT=''; SHA=''; SIZE=''
  echo "deploy_id=$DEPLOY_ID action=rollback snapshot=$ROLLBACK_TO"
else
  build_artifact
  ACTION='apply'
  OBJECT="inbox/${DEPLOY_ID}.tar"
  SHA=$(cat "$WORK/sha")
  SIZE=$(cat "$WORK/size")
  echo "deploy_id=$DEPLOY_ID action=apply object=$OBJECT sha256=$SHA size=$SIZE byte"
  echo "isi artefak:"
  sed 's/^/  /' "$STAGE/DEPLOY-MANIFEST.sha256"
fi

if [ "$APPLY" != "1" ]; then
  echo "DRY-RUN: tidak ada yang diunggah ke gs://$BUCKET_NAME dan tidak ada pesan ke $TOPIC"
  echo "Tambah --apply untuk menjalankan."
  exit 0
fi

CMD=$(jq -cn --arg id "$DEPLOY_ID" --arg act "$ACTION" --arg obj "$OBJECT" --arg sha "$SHA" --arg sz "$SIZE" \
  '{deploy_id:$id, action:$act, object:$obj, sha256:$sha, size:($sz|tonumber? // null)}')

api() { # api <metode> <path> <body> -> body; gagal kalau http != 200
  local method=$1 path=$2 payload=$3 out code body
  out=$(curl -sS -m 120 -w '\n%{http_code}' -X "$method" \
    -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
    -d "$payload" "https://pubsub.googleapis.com/v1/${path}")
  code=$(printf '%s' "$out" | tail -n1)
  body=$(printf '%s' "$out" | head -n -1)
  if [ "$code" != "200" ]; then
    echo "http=$code untuk $method $path body=$(printf '%.400s' "$body")" >&2
    return 1
  fi
  printf '%s' "$body"
}

if [ -z "${ACCESS_TOKEN:-}" ]; then
  command -v gcloud >/dev/null || { echo "gcloud tidak ada di PATH dan ACCESS_TOKEN tidak diset" >&2; exit 1; }
  ACCESS_TOKEN=$(gcloud auth print-access-token)
fi

if [ -z "$ROLLBACK_TO" ]; then
  gcloud storage cp --quiet "$WORK/artifact.tar" "gs://$BUCKET_NAME/$OBJECT"
  # Bukti bahwa objek mendarat utuh. sha256 tetap jadi gerban isi (diperiksa agen);
  # GCS JSON API tidak mengekspos sha256 objek, jadi yang dibandingkan di sini md5Hash
  # + size yang memang ada di metadata objek.
  enc=$(printf '%s' "$OBJECT" | jq -sRr '@uri')
  META=$(curl -sS -m 60 -H "Authorization: Bearer $ACCESS_TOKEN" \
    "https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}/o/${enc}?fields=size,md5Hash") \
    || { echo "gagal membaca metadata gs://$BUCKET_NAME/$OBJECT" >&2; exit 1; }
  REMOTE_MD5=$(printf '%s' "$META" | jq -r '.md5Hash // empty' | base64 -d | od -An -tx1 | tr -d ' \n')
  REMOTE_SIZE=$(printf '%s' "$META" | jq -r '.size // empty')
  LOCAL_MD5=$(md5sum "$WORK/artifact.tar" | awk '{print $1}')
  [ "$REMOTE_MD5" = "$LOCAL_MD5" ] || { echo "md5 remote tidak cocok: remote=$REMOTE_MD5 lokal=$LOCAL_MD5" >&2; exit 1; }
  [ "$REMOTE_SIZE" = "$SIZE" ] || { echo "size remote tidak cocok: remote=$REMOTE_SIZE lokal=$SIZE" >&2; exit 1; }
  echo "terunggah gs://$BUCKET_NAME/$OBJECT (md5+size terverifikasi)"
fi

api POST "${TOPIC}:publish" "$(jq -cn --arg d "$(base64 -w0 <<<"$CMD")" '{messages:[{data:$d}]}')" \
  | jq -r '.messageIds[0] // "tanpa message_id"' | sed 's/^/pesan perintah: /'

echo "menunggu hasil dari agen VM (maks ${DEADLINE_SEC}s)..."
END=$(( $(date +%s) + DEADLINE_SEC ))
SEEN=''
while [ "$(date +%s)" -lt "$END" ]; do
  RESP=$(api POST "${RESULTS_SUB}:pull" '{"maxMessages":5,"returnImmediately":true}') || { sleep 5; continue; }
  M=$(printf '%s' "$RESP" | jq -r 'if .receivedMessages then (.receivedMessages|length) else 0 end')
  for i in $(seq 0 $((M - 1))); do
    ACK_ID=$(printf '%s' "$RESP" | jq -r ".receivedMessages[$i].ackId")
    DATA=$(printf '%s' "$RESP" | jq -r ".receivedMessages[$i].message.data" | base64 -d)
    GOT_ID=$(printf '%s' "$DATA" | jq -r '.deploy_id // empty')
    ST=$(printf '%s' "$DATA" | jq -r '.status // "?"')
    MSGTXT=$(printf '%s' "$DATA" | jq -r '.message // ""')
    if [ "$GOT_ID" != "$DEPLOY_ID" ]; then
      # Bukan hasil kita: jangan di-ack, biarkan pemiliknya mengambil lewat redelivery.
      SEEN="${SEEN}${GOT_ID}:${ST} "
      continue
    fi
    api POST "${RESULTS_SUB}:acknowledge" "$(jq -cn --arg a "$ACK_ID" '{ackIds:[$a]}')" >/dev/null
    echo "hasil: deploy_id=$GOT_ID status=$ST message=$MSGTXT"
    [ -z "$SEEN" ] || echo "hasil lain ditinggal (bukan deploy_id ini): $SEEN"
    [ "$ST" = "applied" ] || [ "$ST" = "rolled_back" ] || exit 1
    exit 0
  done
  sleep 5
done

echo "TIMEOUT: tidak ada hasil untuk $DEPLOY_ID dalam ${DEADLINE_SEC}s" >&2
[ -z "$SEEN" ] || echo "hasil lain yang lewat: $SEEN" >&2
exit 1
