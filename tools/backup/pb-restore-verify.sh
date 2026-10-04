#!/usr/bin/env bash
# Verifikasi restore-point: ambil zip backup terbaru dari GCS, buka instance
# PocketBase throwaway (hanya loopback) dari data hasil restore, lalu hitung
# koleksi & record untuk membuktikan backup benar-benar bisa dipakai.
set -euo pipefail

URI=$(gcloud storage ls 'gs://pickertime-pb-backups/**/*.zip' 2>/dev/null | sort | tail -1)
[ -n "$URI" ] || { echo "tidak ada objek backup di bucket" >&2; exit 1; }
echo "MARKER_uri $URI"

WORK=/tmp/pb-restore-verify
rm -rf "$WORK"; mkdir -p "$WORK/data"
gcloud storage cp "$URI" "$WORK/latest.zip" >/dev/null
echo "MARKER_zip_md5 $(python3 -c 'import hashlib,base64,sys;print(base64.b64encode(hashlib.md5(open(sys.argv[1],"rb").read()).digest()).decode())' "$WORK/latest.zip")"

python3 -m zipfile -e "$WORK/latest.zip" "$WORK/data"
echo "MARKER_unzipped"
ls -1 "$WORK/data" | head

EMAIL=$(awk -F= '/^PB_ADMIN_EMAIL=/{print substr($0,index($0,"=")+1)}' /opt/pickertime/.env | head -1)
PASS=$(awk -F= '/^PB_ADMIN_PASSWORD=/{print substr($0,index($0,"=")+1)}' /opt/pickertime/.env | head -1)

docker rm -f pb-restore-verify >/dev/null 2>&1 || true
docker run -d --name pb-restore-verify --network bridge \
  -p 127.0.0.1:8091:8090 \
  -v "$WORK/data:/pb_data" \
  ghcr.io/muchobien/pocketbase:0.40.4 serve --dir=/pb_data --http=0.0.0.0:8090 >/dev/null
sleep 6

echo "MARKER_health $(curl -fsS -m 10 http://127.0.0.1:8091/api/health | jq -r .message)"
TOKEN=$(curl -fsS -m 20 -X POST http://127.0.0.1:8091/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$EMAIL\",\"password\":\"$PASS\"}" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then echo "MARKER_auth FAIL"; else echo "MARKER_auth OK"; fi

echo "MARKER_collections"
curl -fsS -m 20 -H "Authorization: $TOKEN" 'http://127.0.0.1:8091/api/collections?perPage=200&type=base' \
  | jq -r '.items[] | .name' | sort
echo "MARKER_counts"
for c in Tasks Focus_Sessions Workspace_Events Profiles; do
  n=$(curl -fsS -m 20 -H "Authorization: $TOKEN" "http://127.0.0.1:8091/api/collections/$c/records?perPage=1" | jq -r '.totalItems')
  echo "$c=$n"
done

echo "MARKER_cleanup"
docker rm -f pb-restore-verify >/dev/null
rm -rf "$WORK"
docker ps --format '{{.Names}}' | grep -c pb-restore-verify || echo "restore instance dibersihkan"
echo "VERIFY_DONE"
