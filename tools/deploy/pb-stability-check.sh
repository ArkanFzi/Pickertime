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
# `pemicu=` membedakan baris yang dihasilkan scheduler (Environment=P8_PEMICU=timer
# di unit systemd) dari baris yang kungetik sendiri; tanpa itu log bukti tidak bisa
# memisahkan hari bersih dari run manual.
# Tidak pernah menyentuh state VM — semuanya baca-saja.
set -euo pipefail

# Cron memanggil skrip ini dengan PATH minimal (/usr/bin:/bin), sementara gcloud hidup di
# ~/.local/bin -- selama tujuh hari (5-11 Okt) itu membuat `gcloud compute ssh` gagal diam-diam,
# read_last_ok mengembalikan string kosong, dan log mencatat ERROR "LAST_OK tidak terbaca" bukan
# "jalur backup mati". PATH diisi ulang di sini supaya alatnya benar di scheduler mana pun,
# bukan di baris crontab yang tidak ikut ke repo.
PATH="$HOME/.local/bin:$PATH"
PEMICU="${P8_PEMICU:-manual}"

PROJECT="${PROJECT:-config-agentic-ubuntu}"
VM="${VM:-hermes-openclaw-vm}"
ZONE="${ZONE:-us-central1-a}"
PB_URL="${PB_URL:-https://api.elarisnoir.my.id}"
LOG_DIR="${LOG_DIR:-$HOME/.local/state/pickertime-stability}"
LOG_FILE="$LOG_DIR/p8.log"
mkdir -p "$LOG_DIR"

# Batas tunggu jalur ukur. Persistent=true menagih hari yang terlewat TEPAT sesudah boot, dan
# di laptop itu berarti skripnya bisa berlari sebelum jaringan naik — terukur 2026-10-13
# 08:38:08 WIB: baris ERROR lahir 1 dtk sesudah unit start, sementara link NetworkManager
# baru ada 08:38:15. Tanpa tunggu, tanggapan itu selalu merah dan selalu terbaca seperti
# masalah state VM (kelas CFG-64, kegagalan yang sama untuk sebab yang berbeda).
# P8_BATAS dijaga tetap di bawah TimeoutStartSec=5min pada unit, supaya yang tersisa saat
# batas habis adalah satu baris ERROR, bukan nol baris karena kena SIGTERM.
P8_COBA="${P8_COBA:-6}"
P8_JEDA="${P8_JEDA:-30}"
P8_KISARAN="${P8_KISARAN:-45}"
P8_BATAS="${P8_BATAS:-240}"
P8_PROBE="${P8_PROBE:-https://oauth2.googleapis.com/}"

# stderr gcloud ditangkap supaya bisa ikut menunjuk alat yang mati. Potongannya diredam
# lebih dulu: deretan panjang yang mirip token tidak boleh masuk log.
redam() {
  sed -E 's/ya29\.[A-Za-z0-9_.-]*/REDACTED/g; s/[A-Za-z0-9_-]{25,}/REDACTED/g' | head -c 200
}

read_last_ok() {
  # sudo -n, bukan sudo: di sesi tanpa TTY (unit systemd) NOPASSWD harus membalas cepat,
  # dan kalau aturan NOPASSWD hilang, `-n` gagal dengan rc sendiri alih-alih menggantung
  # menunggu kata sandi yang tidak akan pernah ada.
  timeout "$P8_KISARAN" gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --command='
    ok=$(sudo -n grep "^LAST_OK=" /opt/pickertime/backup-state.env | cut -d= -f2)
    failed=$(sudo -n grep -l "\"status\":\"failed\"" /var/lib/pickertime-deploy/result.json 2>/dev/null | wc -l)
    echo "$ok $failed"
  ' 2>"$1" | tail -1
}

MULA=$(date -u +%s)
pair=""
rc=0
coba=0
err=""
while [ "$coba" -lt "$P8_COBA" ]; do
  coba=$((coba + 1))
  ERRF=$(mktemp)
  rc=0
  pair=$(read_last_ok "$ERRF") || rc=$?
  if [ -n "$pair" ]; then
    rm -f "$ERRF"
    break
  fi
  err=$(grep -m1 '[^[:space:]]' "$ERRF" | redam || true)
  rm -f "$ERRF"
  SEKARANG=$(date -u +%s)
  sisa=$((P8_BATAS - (SEKARANG - MULA)))
  if [ "$coba" -ge "$P8_COBA" ] || [ "$sisa" -le 0 ]; then
    break
  fi
  if [ "$P8_JEDA" -lt "$sisa" ]; then
    sleep "$P8_JEDA"
  else
    sleep "$sisa"
  fi
done

LAST_OK=${pair%% *}
STALE_FAILED=${pair##* }

if [ -z "$LAST_OK" ] || ! date -d "$LAST_OK" >/dev/null 2>&1; then
  # Pesan harus menunjuk alat yang mati, bukan data. Dulu kedua sebab (gcloud tidak
  # ketemu di PATH, dan ssh memang mengembalikan kosong) dicetak identik, jadi tujuh
  # hari kebutaan PATH terbaca seperti masalah state VM.
  SEBAB="ssh/read_last_ok mengembalikan kosong (rc=$rc, percobaan=$coba)"
  if [ -n "$err" ]; then
    SEBAB="$SEBAB -- stderr: $err"
  fi
  if [ -n "$pair" ]; then
    # Keluaran ada tapi bukan tanggal: ini state VM yang tidak terbaca, bukan alatnya.
    # Nilai mentahnya tidak dicetak; panjang saja (aturan H13).
    SEBAB="gcloud membalas tapi LAST_OK-nya bukan tanggal (panjang keluaran=${#pair}, rc=$rc)"
  elif ! command -v gcloud >/dev/null 2>&1; then
    SEBAB="gcloud tidak ada di PATH ($PATH)"
  elif [ ! -d "$HOME/.config/gcloud" ]; then
    SEBAB="kredensial gcloud tidak ada (~/.config/gcloud kosong)"
  elif [ "$rc" = "124" ]; then
    SEBAB="gcloud kena batas $P8_KISARAN dtk per percobaan (rc=124) setelah $coba percobaan"
  elif ! curl -fsS -m 5 -o /dev/null "$P8_PROBE" 2>/dev/null; then
    SEBAB="jaringan/endpoint gcloud tidak terjangkau ($P8_PROBE gagal) setelah $coba percobaan, rc=$rc"
  fi
  echo "P8 $(date -u +%F) ERROR pemicu=$PEMICU: LAST_OK tidak terbaca ('${LAST_OK:-kosong}') -- sebab: $SEBAB" | tee -a "$LOG_FILE"
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

line="P8 $(date -u +%FT%TZ) pemicu=$PEMICU backup_umur_jam=$AGE_H hasil_terendap=${STALE_FAILED:-?} health_http=$HEALTH STATUS=$STATUS"
printf '%s\n' "$line" | tee -a "$LOG_FILE"
[ "$STATUS" = "HIJAU" ]
