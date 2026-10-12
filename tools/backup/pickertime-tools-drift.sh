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
# Dua pasangan terakhir bukan berkas Pickertime: ia berkas repo `ArkanFzi/config-agentic` di
# checkout VM, dan ia masuk karena CFG-70 -- `/opt/healthcheck/hermes_healthcheck.py` adalah
# bahan yang dipakai Docker Healthcheck untuk memutuskan merestart kontainer otak, dan
# tidak satu pun penjaga menyentuhnya. Sengaja pakai sumber sha per-pasangan (`|cfg`), bukan
# satu REPO global: kalau tidak, `git -C Pickertime show origin/dev:docker-compose.yml`
# membalas REPO_TIDAK_ADA dan dua pasangan baru itu merah permanen tanpa pernah mengukur apa
# pun -- kelas kegagalan yang sama dengan CFG-66 (penjaga yang merah karena dirinya sendiri
# cacat, bukan karena drift).
#
# Keluaran HANYA nama berkas + 16 karakter depan sha256 (aturan H13): cukup untuk memutuskan
# SAMA / BEDA / HILANG, tanpa pernah mencetak isi berkas. Tidak ada `set -x` (H4). Perintah
# jarak jauh dikirim lewat stdin yang di-base64, jadi tidak ada isi berkas atau kredensial
# yang masuk ke argv proses.
set -euo pipefail

REPO="${REPO:-$HOME/Documents/Coding/Pickertime}"
REF="${REF:-origin/dev}"
CFG_REPO="${CFG_REPO:-$HOME/openclaw-docker}"
CFG_REF="${CFG_REF:-origin/master}"
ZONE="${ZONE:-us-central1-a}"
PROJECT="${PROJECT:-config-agentic-ubuntu}"

# vm|jalur-di-VM|jalur-di-repo|sumber  (sumber: pt = REPO/REF, cfg = CFG_REPO/CFG_REF; kosong = pt)
PAIRS=(
  "hermes-openclaw-vm|/opt/pickertime/pickertime-pb-backup.sh|tools/backup/pickertime-pb-backup.sh|pt"
  "hermes-openclaw-vm|/etc/systemd/system/pickertime-pb-backup.service|tools/backup/pickertime-pb-backup.service|pt"
  "hermes-openclaw-vm|/etc/systemd/system/pickertime-pb-backup.timer|tools/backup/pickertime-pb-backup.timer|pt"
  "hermes-openclaw-vm|/opt/pickertime/pickertime-pb-agent.sh|tools/deploy/pickertime-pb-agent.sh|pt"
  "hermes-openclaw-vm|/etc/systemd/system/pickertime-pb-agent.service|tools/deploy/pickertime-pb-agent.service|pt"
  "hermes-openclaw-vm|/etc/systemd/system/pickertime-pb-agent.timer|tools/deploy/pickertime-pb-agent.timer|pt"
  "agentic-watchdog-vm|/opt/pickertime-backups/pickertime-pb-relay.sh|tools/backup/pickertime-pb-relay.sh|pt"
  "agentic-watchdog-vm|/etc/systemd/system/pickertime-pb-relay.service|tools/backup/pickertime-pb-relay.service|pt"
  "agentic-watchdog-vm|/etc/systemd/system/pickertime-pb-relay.timer|tools/backup/pickertime-pb-relay.timer|pt"
  "hermes-openclaw-vm|/home/arkan/openclaw-docker/scripts/hermes_healthcheck.py|scripts/hermes_healthcheck.py|cfg"
  "hermes-openclaw-vm|/home/arkan/openclaw-docker/docker-compose.yml|docker-compose.yml|cfg"
)

sumber_dir() { case "$1" in cfg) printf '%s' "$CFG_REPO" ;; *) printf '%s' "$REPO" ;; esac; }
sumber_ref() { case "$1" in cfg) printf '%s' "$CFG_REF" ;; *) printf '%s' "$REF" ;; esac; }

# sha256 versi repo, dibaca dari git (worktree tidak dipakai supaya hasil tidak bergantung
# pada keadaan branch yang sedang checked out). Catatan penting: hash HARUS diambil dari pipa
# `git show | sha256sum`, bukan dari `content=$(git show ...)` -- command substitution
# menggarong baris kosong akhir, jadi sisi repo dapat sha yang berbeda untuk berkas yang sama
# dan semua baris keluar BEDA palsu (terukur 2026-10-12: 9/9 BEDA padahal VM identik `dev`).
# Kunci kamus memuat nama sumber (`pt|...`, `cfg|...`) supaya berkas yang namanya sama di dua
# repo tidak saling menimpa.
declare -A REPO_SHA=()
for entry in "${PAIRS[@]}"; do
  IFS='|' read -r _ _ repo_path src <<<"$entry"
  src="${src:-pt}"
  key="$src|$repo_path"
  if [ -z "${REPO_SHA[$key]+x}" ]; then
    dir=$(sumber_dir "$src"); ref=$(sumber_ref "$src")
    if git -C "$dir" cat-file -e "$ref:$repo_path" 2>/dev/null; then
      REPO_SHA[$key]=$(git -C "$dir" show "$ref:$repo_path" | sha256sum | cut -c1-16)
    else
      REPO_SHA[$key]="REPO_TIDAK_ADA"
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
  IFS='|' read -r vm vm_path repo_path src <<<"$entry"
  src="${src:-pt}"
  checked=$((checked + 1))
  key="$src|$repo_path"
  r="${REPO_SHA[$key]-TIDAK_DIUKUR}"
  v="${VM_SHA[$vm_path]-TIDAK_DIUKUR}"
  if [ "$r" = "$v" ]; then
    printf 'SAMA   %-28s %s\n' "$vm" "$repo_path"
  else
    drift=$((drift + 1))
    printf 'BEDA   %-28s %s:%s repo=%s vm=%s\n' "$vm" "$src" "$repo_path" "$r" "$v"
  fi
done

printf 'periksa=%s drift=%s\n' "$checked" "$drift"
[ "$drift" -eq 0 ] || exit 1
