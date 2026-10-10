#!/usr/bin/env bash
# Baca-saja: bandingkan environment yang ditulis di berkas dengan yang sedang TERPASANG di
# container PocketBase produksi, dan sebut nama model yang terpasang di hook.
#
# Kenapa ini perlu: nilai env dibakar ke config container saat `docker run`. `docker restart`
# (yang dilakukan agen deploy) TIDAK membaca ulang berkas — jadi key hasil rotasi baru terpakai
# setelah container DIBUAT ULANG. Sebelum membuat ulang, cek bahwa PB_ADMIN_EMAIL/PASSWORD di
# berkas sama dengan yang di container; kalau tidak, recreate itu akan MENIMPA superuser produksi
# dengan nilai berkas (invarian M8.1).
#
# DILARANG mencetak nilai. Yang keluar cuma nama key, panjang, dan 12 karakter pertama sha256 —
# cukup untuk memutuskan "sama / BEDA" (aturan H13).
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/pickertime/.env}"
CONTAINER="${CONTAINER:-pickertime-pocketbase}"
HOOK="${HOOK:-/opt/pickertime/app/pb_hooks/ai_proxy.pb.js}"
KEYS=("GEMINI_API_KEY" "PB_ADMIN_EMAIL" "PB_ADMIN_PASSWORD")

[ -f "$ENV_FILE" ] || { echo "BERKAS_ENV_TIDAK_ADA $ENV_FILE"; exit 2; }
[ -f "$HOOK" ] || { echo "HOOK_TIDAK_ADA $HOOK"; exit 2; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "CONTAINER_TIDAK_ADA $CONTAINER"; exit 2; }

fprefix() { printf '%s' "$1" | sha256sum | cut -c1-12; }

declare -A F
while IFS='=' read -r k v; do
  k="${k//[[:space:]]/}"
  v="${v%$'\r'}"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  F["$k"]="$v"
done < <(grep -E '^[A-Z_]+=' "$ENV_FILE" || true)

declare -A C
while IFS= read -r line; do
  [ -n "$line" ] || continue
  C["${line%%=*}"]="${line#*=}"
done < <(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER")

DIFF=0
for k in "${KEYS[@]}"; do
  a="${F[$k]-}"; b="${C[$k]-}"
  if [ -z "$a" ] || [ -z "$b" ]; then
    echo "$k ABSEN file=${#a} container=${#b}"; DIFF=$((DIFF + 1)); continue
  fi
  if [ "$(fprefix "$a")" = "$(fprefix "$b")" ]; then
    echo "$k sama len=${#a} sha=$(fprefix "$a")"
  else
    echo "$k BEDA len_file=${#a} sha_file=$(fprefix "$a") len_container=${#b} sha_container=$(fprefix "$b")"
    DIFF=$((DIFF + 1))
  fi
done

MODEL_LINE="tidak_ada_const_MODEL"
if grep -qE '^ *const MODEL = "[^"]+"' "$HOOK"; then
  MODEL_LINE=$(grep -m1 -oE '^ *const MODEL = "[^"]+"' "$HOOK" | sed -E 's/.*"([^"]+)".*/\1/')
elif grep -qE 'models/[A-Za-z0-9._-]+:generateContent' "$HOOK"; then
  MODEL_LINE="di-inline: $(grep -m1 -oE 'models/[A-Za-z0-9._-]+:generateContent' "$HOOK")"
fi

echo "hook_model=$MODEL_LINE"
echo "env_keys_file=$(printf '%s ' "${!F[@]}" | tr -s ' ')"
echo "env_keys_container=$(printf '%s ' "${!C[@]}" | tr -s ' ')"
if [ "$DIFF" -ne 0 ]; then
  echo "HASIL: DRIFT — $DIFF key berbeda (atau absen). docker restart TIDAK akan memaksa nilai berkas (env dibakar di config container): pakai docker rm + docker run --env-file, dan pastikan PB_ADMIN_* memang sengaja mau diganti."
  exit 1
fi
echo "HASIL: file == container untuk ${#KEYS[@]} key, tidak ada drift."
