#!/usr/bin/env bash
# Baca-saja: bandingkan sha256 perkakas di branch `dev` dengan yang TERPASANG di VM.
#
# Kenapa ini perlu: CFG-29 mencatat tidak ada penjaga sinkron antara skrip di repo dan yang
# jalan di /opt/pickertime, dan drift itu sudah dua kali mengubah hasil uji -- T-34 sempat
# memasang di atas bahan yang salah, dan T-36 membuat mesin berjalan dengan retensi lama
# sementara `dev` sudah punya ledger. Angka pertama pasangan ini terukur 2026-10-12: skrip
# backup di VM ber-sha256[0:16] sama dengan versi `dev` SEBELUM T-36, jadi selisihnya persis
# blok retensi -- bukan misteri, tapi juga bukan sesuatu yang bisa dilihat tanpa diukur.
#
# Keluaran HANYA nama berkas + 16 karakter depan sha256 (aturan H13): cukup untuk memutuskan
# SAMA / BEDA / HILANG, tanpa pernah mencetak isi berkas. Tidak ada `set -x` (H4). Perintah
# jarak jauh dikirim lewat stdin yang di-base64, jadi tidak ada isi berkas atau kredensial
# yang masuk ke argv proses.
set -euo pipefail

REPO="${REPO:-$HOME/Documents/Coding/Pickertime}"
REF="${REF:-origin/dev}"
ZONE="${ZONE:-us-central1-a}"
PROJECT="${PROJECT:-config-agentic-ubuntu}"

# vm|jalur-di-VM|jalur-di-repo
PAIRS=(
  "hermes-openclaw-vm|/opt/pickertime/pickertime-pb-backup.sh|tools/backup/pickertime-pb-backup.sh"
  "hermes-openclaw-vm|/etc/systemd/system/pickertime-pb-backup.service|tools/backup/pickertime-pb-backup.service"
  "hermes-openclaw-vm|/etc/systemd/system/pickertime-pb-backup.timer|tools/backup/pickertime-pb-backup.timer"
  "hermes-openclaw-vm|/opt/pickertime/pickertime-pb-agent.sh|tools/deploy/pickertime-pb-agent.sh"
  "hermes-openclaw-vm|/etc/systemd/system/pickertime-pb-agent.service|tools/deploy/pickertime-pb-agent.service"
  "hermes-openclaw-vm|/etc/systemd/system/pickertime-pb-agent.timer|tools/deploy/pickertime-pb-agent.timer"
  "agentic-watchdog-vm|/opt/pickertime-backups/pickertime-pb-relay.sh|tools/backup/pickertime-pb-relay.sh"
  "agentic-watchdog-vm|/etc/systemd/system/pickertime-pb-relay.service|tools/backup/pickertime-pb-relay.service"
  "agentic-watchdog-vm|/etc/systemd/system/pickertime-pb-relay.timer|tools/backup/pickertime-pb-relay.timer"
)

# sha256 versi repo, dibaca dari git (worktree tidak dipakai supaya hasil tidak bergantung
# pada keadaan branch yang sedang checked out). Catatan penting: hash HARUS diambil dari pipa
# `git show | sha256sum`, bukan dari `content=$(git show ...)` -- command substitution
# menggarong baris kosong akhir, jadi sisi repo dapat sha yang berbeda untuk berkas yang sama
# dan semua baris keluar BEDA palsu (terukur 2026-10-12: 9/9 BEDA padahal VM identik `dev`).
declare -A REPO_SHA=()
for entry in "${PAIRS[@]}"; do
  repo_path="${entry##*|}"
  if [ -z "${REPO_SHA[$repo_path]+x}" ]; then
    if git -C "$REPO" cat-file -e "$REF:$repo_path" 2>/dev/null; then
      REPO_SHA[$repo_path]=$(git -C "$REPO" show "$REF:$repo_path" | sha256sum | cut -c1-16)
    else
      REPO_SHA[$repo_path]="REPO_TIDAK_ADA"
    fi
  fi
done

# sha256 versi terpasang, satu panggilan ssh per VM supaya cepat.
declare -A VM_SHA=()
vms=$(printf '%s\n' "${PAIRS[@]}" | cut -d'|' -f1 | sort -u)
for vm in $vms; do
  paths=""
  for entry in "${PAIRS[@]}"; do
    [ "${entry%%|*}" = "$vm" ] || continue
    rest="${entry#*|}"
    paths+=" ${rest%%|*}"
  done
  snippet='for p in'"$paths"'; do if [ -r "$p" ]; then printf "%s %s\n" "$(sha256sum "$p" | cut -c1-16)" "$p"; else printf "TIDAK_KEBACA %s\n" "$p"; fi; done'
  b64=$(printf '%s' "$snippet" | base64 -w0)
  out=$(gcloud compute ssh "$vm" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap \
    --command="echo $b64 | base64 -d | sudo -n bash" 2>/dev/null) || out=""
  if [ -z "$out" ]; then
    for entry in "${PAIRS[@]}"; do
      [ "${entry%%|*}" = "$vm" ] || continue
      rest="${entry#*|}"
      VM_SHA["${rest%%|*}"]="SSH_GAGAL"
    done
    continue
  fi
  while read -r sha path; do
    [ -n "${path:-}" ] || continue
    VM_SHA["$path"]="$sha"
  done <<<"$out"
done

drift=0
checked=0
for entry in "${PAIRS[@]}"; do
  vm="${entry%%|*}"
  rest="${entry#*|}"
  vm_path="${rest%%|*}"
  repo_path="${rest##*|}"
  checked=$((checked + 1))
  r="${REPO_SHA[$repo_path]}"
  v="${VM_SHA[$vm_path]-TIDAK_DIUKUR}"
  if [ "$r" = "$v" ]; then
    printf 'SAMA   %-28s %s\n' "$vm" "$repo_path"
  else
    drift=$((drift + 1))
    printf 'BEDA   %-28s %s repo=%s vm=%s\n' "$vm" "$repo_path" "$r" "$v"
  fi
done

printf 'periksa=%s drift=%s\n' "$checked" "$drift"
[ "$drift" -eq 0 ] || exit 1
