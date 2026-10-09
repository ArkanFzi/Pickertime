#!/usr/bin/env bash
# F-54: shell kerja pernah memakai node v18.20.8 sementara .nvmrc mengunci 22.23.2, dan
# gerbang ini gagal sebagai `node: bad option: --disable-warning=...` (rc=9) -- bukan
# karena kontraknya merah, tapi karena flag-nya tidak dikenali. Gate yang mati karena
# flag tidak bisa dibedakan dari gate yang mati karena bug, jadi versi diperiksa di sini
# (bash, bukan node) sebelum perintahnya dijalankan.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REQUIRED="$(tr -d '[:space:]' < "$ROOT/.nvmrc")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node tidak ada di PATH. Repo ini mengunci node ${REQUIRED} (isi .nvmrc)." >&2
  exit 1
fi

ACTIVE="$(node -v | sed 's/^v//')"
if [ "$(printf '%s\n%s\n' "$ACTIVE" "$REQUIRED" | sort -V | head -1)" != "$REQUIRED" ]; then
  # Direktori nvm SELALU berprefiks v (terukur: ~/.nvm/versions/node/{v18.20.8,v22.23.2,...})
  # padahal .nvmrc berisi angka telanjang, jadi remedy harus menempelkan "v" sendiri —
  # versi lama mencetak ".../node/22.23.2/bin" yang tidak ada dan kegagalan remedy
  # menyerupai kegagalan yang diperbaikinya.
  cat >&2 <<EOF
Node aktif ${ACTIVE}, repo ini butuh >= ${REQUIRED} (isi .nvmrc; CI memakai 22).
Yang perlu versi ini: baca lib/*.ts langsung (type stripping) dan flag
--disable-warning / --experimental-sqlite. Nyalakan yang benar:
  nvm use
atau, tanpa nvm:
  export PATH="\$HOME/.nvm/versions/node/v${REQUIRED}/bin:\$PATH"
EOF
  exit 1
fi

exec "$@"
