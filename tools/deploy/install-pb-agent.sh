#!/usr/bin/env bash
# Pasang agen deploy di VM produksi: salin skrip + unit systemd, aktifkan timer.
# Dijalankan dari laptop (lewat IAP, pakai kunci SSH metadata milik manusia —
# satu-satunya identitas yang memang bisa login ke VM ini).
#
#   install-pb-agent.sh            # kering: tampilkan apa yang akan dipasang + drift
#   install-pb-agent.sh --apply
set -euo pipefail

PROJECT="${PROJECT:-config-agentic-ubuntu}"
INSTANCE="${INSTANCE:-hermes-openclaw-vm}"
ZONE="${ZONE:-us-central1-a}"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
APP_DIR=/opt/pickertime
QUIET_STDERR='consider installing NumPy|To increase the performance|cloud.google.com/iap/docs|^WARNING: *$'

APPLY=0
[ "${1:-}" != "--apply" ] || APPLY=1

gssh() {
  gcloud compute ssh "iap_ssh_tunnel@${INSTANCE}" --project="$PROJECT" --zone="$ZONE" \
    --tunnel-through-iap --command="$1" 2> >(grep -Ev "$QUIET_STDERR" >&2 || true)
}

send() { # send <file-lokal> <path-remote-sementara> — stdin lewat ssh, tanpa scp
  local src=$1 dst=$2
  if [ "$APPLY" != "1" ]; then echo "(kering) kirim $(basename "$src") -> $dst"; return 0; fi
  gcloud compute ssh "iap_ssh_tunnel@${INSTANCE}" --project="$PROJECT" --zone="$ZONE" \
    --tunnel-through-iap --command="cat > '$dst'" < "$src" 2> >(grep -Ev "$QUIET_STDERR" >&2 || true)
  local n
  n=$(wc -c < "$src")
  gssh "test \"\$(stat -c %s '$dst')\" = '$n' || { echo 'ukuran tidak cocok: $dst' >&2; exit 1; }"
}

FILES=(pickertime-pb-agent.sh pickertime-pb-agent.service pickertime-pb-agent.timer)
remote_path() { # unit systemd hidup di /etc/systemd/system, skrip di $APP_DIR
  case "$1" in
    *.sh) echo "$APP_DIR/$1" ;;
    *) echo "/etc/systemd/system/$1" ;;
  esac
}

echo "== drift lokal vs VM (sha256) =="
for f in "${FILES[@]}"; do
  [ -f "$REPO_ROOT/tools/deploy/$f" ] || { echo "berkas lokal hilang: tools/deploy/$f" >&2; exit 1; }
  L=$(sha256sum "$REPO_ROOT/tools/deploy/$f" | awk '{print $1}')
  rp=$(remote_path "$f")
  if [ "$APPLY" != "1" ]; then
    echo "(kering) $f lokal=${L:0:12} -> $rp (VM tidak dibaca)"
    continue
  fi
  R=$(gssh "sudo sha256sum '$rp' 2>/dev/null | awk '{print \$1}'" | tr -d '\r')
  if [ "$L" = "$R" ]; then echo "sama    $f -> $rp"; else echo "BEDA    $f  lokal=${L:0:12} vm=${R:0:12} -> $rp"; fi
done

if [ "$APPLY" != "1" ]; then
  echo "DRY-RUN: tidak ada yang ditulis ke VM. Tambah --apply."
  exit 0
fi

for f in "${FILES[@]}"; do
  send "$REPO_ROOT/tools/deploy/$f" "/tmp/$f.new"
done

gssh "
  set -e
  sudo install -m 0755 -o root -g root /tmp/pickertime-pb-agent.sh.new $APP_DIR/pickertime-pb-agent.sh
  sudo install -m 0644 -o root -g root /tmp/pickertime-pb-agent.service.new /etc/systemd/system/pickertime-pb-agent.service
  sudo install -m 0644 -o root -g root /tmp/pickertime-pb-agent.timer.new /etc/systemd/system/pickertime-pb-agent.timer
  rm -f /tmp/pickertime-pb-agent.*.new
  sudo mkdir -p $APP_DIR/releases /var/lib/pickertime-deploy
  sudo chmod 700 /var/lib/pickertime-deploy
  sudo bash -n $APP_DIR/pickertime-pb-agent.sh
  sudo systemctl daemon-reload
  sudo systemctl enable --now pickertime-pb-agent.timer
  echo '== terpasang =='
  sudo systemctl list-timers --no-pager pickertime-pb-agent.timer | tail -2
"
echo "selesai. Cek hasil: sudo systemctl status pickertime-pb-agent.service"
