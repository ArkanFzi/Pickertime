#!/usr/bin/env bash
# Rekam bukti state perangkat (alarm, notifikasi, izin, crash) ke tools/test/tmp/.
# Dipakai sebelum/sesudah tiap skenario uji supaya klaim punya artefak, bukan ingatan.
set -euo pipefail

ADB="${PT_ADB:-$HOME/opt/platform-tools/adb}"
PKG="${PT_PKG:-my.id.elarisnoir.pickertime}"
LABEL="${1:-probe}"
cd "$(dirname "$0")/../.."
OUT="tools/test/tmp/probe-$(date -u +%Y%m%dT%H%M%SZ)-$LABEL.txt"
mkdir -p tools/test/tmp

{
  echo "# probe $LABEL @ $(date -u +%FT%TZ)"
  echo "## paket terpasang"
  "$ADB" shell pm list packages | grep -i elarisnoir || echo "(tidak ada)"
  echo "## ruang /data"
  "$ADB" shell df -h /data | tail -1
  echo "## alarm terjadwal"
  "$ADB" shell dumpsys alarm 2>/dev/null | grep -i "${PKG##*.}\|elarisnoir" || echo "(0 alarm untuk paket ini)"
  echo "## notifikasi aktif"
  # Sengaja hanya baris "Notification Record{" — grep bebas pada dump --noredact
  # ikut menarik isi notifikasi aplikasi lain yang kebetulan menyebut host yang sama.
  "$ADB" shell dumpsys notification --noredact 2>/dev/null | grep "Notification Record{" | grep -i "$PKG" | cut -c1-180 || echo "(0 notifikasi untuk paket ini)"
  echo "## izin runtime"
  "$ADB" shell dumpsys package "$PKG" 2>/dev/null | grep -A12 "runtime permissions" || echo "(paket belum terpasang)"
  echo "## pid proses"
  "$ADB" shell pidof "$PKG" || echo "(tidak berjalan)"
  echo "## crash buffer"
  "$ADB" logcat -d -b crash -t 40 2>/dev/null | tail -20 || true
} >"$OUT" 2>&1

echo "tersimpan: $OUT"
sed -n '1,40p' "$OUT"
