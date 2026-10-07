#!/usr/bin/env bash
# Jalan setiap rute lewat deep link dan tegakkan hal yang bisa diukur mesin:
# app tidak mati, fokus masih milik paket ini, dan tidak ada entri crash baru.
# Teks di layar TIDAK bisa dibaca headless di perangkat ini (RN Fabric menggambar ke
# canvas, `dumpsys activity top` kosong, `uiautomator dump` gagal "could not get idle
# state" karena animasi loop), jadi tiap rute juga discreenshot untuk dinilai manusia/agen.
set -uo pipefail

ADB="${PT_ADB:-$HOME/opt/platform-tools/adb}"
PKG="${PT_PKG:-my.id.elarisnoir.pickertime}"
OUT="tools/test/tmp/routes"
NODE_BIN="${PT_NODE_BIN:-$HOME/.nvm/versions/node/v22.23.2/bin}"
export PATH="$NODE_BIN:$PATH"
cd "$(dirname "$0")/../.."

ROUTES=(
  "/" "schedule" "timeline" "insights" "profile"
  "focus" "edit-task" "smart-alarm"
  "sign-in" "sign-up" "welcome"
)

mkdir -p "$OUT"
[ -x "$ADB" ] || { echo "GAGAL: adb tidak ada di $ADB (set PT_ADB)"; exit 1; }

pid="$("$ADB" shell pidof "$PKG" | tr -d '\r')"
if [ -z "$pid" ]; then
  echo "GAGAL: $PKG tidak berjalan. Jalankan dulu: npm run test:device:up (lalu npm run test:auth:inject untuk masuk)"
  exit 1
fi

printf '%-14s %-8s %-8s %-7s %s\n' RUTE PID FOKUS CRASH VERDICT
fails=0
for r in "${ROUTES[@]}"; do
  "$ADB" logcat -b crash -c >/dev/null 2>&1
  "$ADB" shell am start -a android.intent.action.VIEW -d "pickertime://$r" >/dev/null 2>&1
  sleep 3
  name="${r#/}"; name="${name:-index}"
  "$ADB" exec-out screencap -p > "$OUT/$name.png" 2>/dev/null

  npid="$("$ADB" shell pidof "$PKG" | tr -d '\r')"
  focus="$("$ADB" shell dumpsys window 2>/dev/null | grep mCurrentFocus | grep -c "$PKG" || true)"
  crash="$("$ADB" logcat -d -b crash 2>/dev/null | grep -c "$PKG" || true)"

  if [ -z "$npid" ]; then verdict="MATI (proses hilang)"; fails=$((fails+1))
  elif [ "$npid" != "$pid" ]; then verdict="RESTART (pid $pid -> $npid)"; fails=$((fails+1))
  elif [ "$crash" != "0" ]; then verdict="CRASH BARU"; fails=$((fails+1))
  elif [ "$focus" = "0" ]; then verdict="fokus bukan paket ini"; fails=$((fails+1))
  else verdict="ok"; fi

  printf '%-14s %-8s %-8s %-7s %s\n' "/$r" "${npid:-—}" "$focus" "$crash" "$verdict"
  pid="$npid"
done

echo
echo "screenshot per rute: $OUT/*.png"
if [ "$fails" -gt 0 ]; then
  echo "$fails rute tidak sehat"
  exit 1
fi
echo "semua ${#ROUTES[@]} rute hidup tanpa crash"
