#!/usr/bin/env bash
# Loop uji perangkat satu perintah: preflight -> adb reverse -> Metro -> deep link dev client.
set -euo pipefail

ADB="${PT_ADB:-$HOME/opt/platform-tools/adb}"
METRO_PORT="${METRO_PORT:-8083}"
PB_HOST_PORT="${PB_HOST_PORT:-8099}"
PB_DEVICE_PORT="${PB_DEVICE_PORT:-8090}"
NODE_BIN="${PT_NODE_BIN:-$HOME/.nvm/versions/node/v22.23.2/bin}"
export PATH="$NODE_BIN:$PATH"
cd "$(dirname "$0")/../.."

node tools/test/preflight.mjs

# Sisi ponsel selalu 127.0.0.1:<port tetap>, jadi .env tidak perlu diubah-ubah meski
# port di host berpindah (8090/8081/8082 sudah dipakai layanan lain di mesin ini).
"$ADB" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT"
"$ADB" reverse "tcp:$PB_DEVICE_PORT" "tcp:$PB_HOST_PORT"
echo "reverse aktif:"
"$ADB" reverse --list

# Metro harus siap sebelum dev client diminta membuka bundle.
(
  for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:$METRO_PORT/status" >/dev/null 2>&1; then break; fi
    sleep 1
  done
  "$ADB" shell am start -a android.intent.action.VIEW \
    -d "exp+pickertime://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$METRO_PORT" >/dev/null
  echo "dev client diarahkan ke Metro localhost:$METRO_PORT"
) &

exec npx expo start --dev-client --port "$METRO_PORT" --localhost
