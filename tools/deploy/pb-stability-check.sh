#!/usr/bin/env bash
# P8 / T-14 — pemeriksaan harian "8 hari bersih".
#
# Mengukur tiga angka per harian dan menempelkannya ke satu log baris:
#   backup_umur_jam   umur LAST_OK (hijau < 26h; timer harian + jitter 15m)
#   hasil_terendap    jumlah result.json status=failed yang lebih tua dari 60 menit
#   health_http       kode HTTP /api/health produksi
#
# Keluaran: satu baris `P8 <tanggal> ... STATUS=HIJAU|MERAH` di stdout,
# plus append ke $LOG_FILE supaya bisa dibaca ulang tanpa histories session.
# Tidak pernah menyentuh state VM — semuanya baca-saja.
set -euo pipefail

PROJECT="${PROJECT:-config-agentic-ubuntu}"
VM="${VM:-hermes-openclaw-vm}"
ZONE="${ZONE:-us-central1-a}"
PB_URL="${PB_URL:-https://api.elarisnoir.my.id}"
LOG_DIR="${LOG_DIR:-$HOME/.local/state/pickertime-stability}"
LOG_FILE="$LOG_DIR/p8.log"
mkdir -p "$LOG_DIR"

read_last_ok() {
  gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --command='
    ok=$(sudo grep "^LAST_OK=" /opt/pickertime/backup-state.env | cut -d= -f2)
    failed=$(sudo grep -l "\"status\":\"failed\"" /var/lib/pickertime-deploy/result.json 2>/dev/null | wc -l)
    echo "$ok $failed"
  ' 2>/dev/null | tail -1
}

pair=$(read_last_ok || true)
LAST_OK=${pair%% *}
STALE_FAILED=${pair##* }

if [ -z "$LAST_OK" ] || ! date -d "$LAST_OK" >/dev/null 2>&1; then
  echo "P8 $(date -u +%F) ERROR: LAST_OK tidak terbaca ('${LAST_OK:-kosong}')" | tee -a "$LOG_FILE"
  exit 1
fi

NOW_EPOCH=$(date -u +%s)
OK_EPOCH=$(date -u -d "$LAST_OK" +%s)
AGE_H=$(( (NOW_EPOCH - OK_EPOCH) / 3600 ))

HEALTH=$(curl -fsS -m 15 -o /dev/null -w "%{http_code}" "$PB_URL/api/health" 2>/dev/null || echo 000)

STATUS=HIJAU
[ "$AGE_H" -lt 26 ] || STATUS=MERAH
[ "${STALE_FAILED:-1}" = "0" ] || STATUS=MERAH
[ "$HEALTH" = "200" ] || STATUS=MERAH

line="P8 $(date -u +%FT%TZ) backup_umur_jam=$AGE_H hasil_terendap=${STALE_FAILED:-?} health_http=$HEALTH STATUS=$STATUS"
printf '%s\n' "$line" | tee -a "$LOG_FILE"
[ "$STATUS" = "HIJAU" ]
