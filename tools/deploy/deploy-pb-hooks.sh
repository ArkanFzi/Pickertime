#!/usr/bin/env bash
# Deploy pb_hooks/ + pb_migrations/ Pickertime ke VM produksi (hermes-openclaw-vm).
#
# Mode default = HANYA lapor drift; tidak ada satu byte pun yang ditulis ke VM
# tanpa --apply. Kalau --apply dan gerbang smoke merah, state VM dikembalikan ke
# snapshot yang baru saja dibuat.
#
# Kredensial gate: PB_SU_EMAIL / PB_SU_PASSWORD dari environment, atau dari berkas
# mode 600 di PB_SU_ENV_FILE (default ~/.config/pickertime/su.env).
# Skrip ini tidak pernah mencetak nilai kredensial, dan tidak boleh dijalankan
# dengan `set -x`.
set -euo pipefail
umask 077

PROJECT="${PROJECT:-config-agentic-ubuntu}"
INSTANCE="${INSTANCE:-hermes-openclaw-vm}"
ZONE="${ZONE:-us-central1-a}"
CONTAINER="${CONTAINER:-pickertime-pocketbase}"
APP_DIR="${APP_DIR:-/opt/pickertime}"
REMOTE_APP="$APP_DIR/app"
PB_URL="${PB_URL:-https://api.elarisnoir.my.id}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SU_ENV_FILE="${PB_SU_ENV_FILE:-$HOME/.config/pickertime/su.env}"

APPLY=0
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    -h|--help) sed -n '1,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "argumen tak dikenal: $a (pakai --apply untuk deploy)" >&2; exit 2 ;;
  esac
done

QUIET_STDERR='consider installing NumPy|To increase the performance|cloud.google.com/iap/docs|^WARNING: *$'

gssh() {
  gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" \
    --tunnel-through-iap --command="$1" \
    2> >(grep -Ev "$QUIET_STDERR" >&2)
}

# "sha256<TAB>path" per file, path relatif terhadap akar (app) dan disortir.
# Perbandingan isi, bukan mtime: cp/rsync mengubah mtime tanpa mengubah isi.
manifest_local() {
  (cd "$REPO_ROOT" && find pb_hooks pb_migrations -type f -print0 | sort -z \
    | xargs -0 sha256sum | awk '{print $1"\t"$2}')
}
manifest_remote() {
  gssh "sudo sh -c 'cd $REMOTE_APP && find pb_hooks pb_migrations -type f -print0 | sort -z \
        | xargs -0 sha256sum'" | awk '{print $1"\t"$2}'
}

MAN_L="$(mktemp)"; MAN_R="$(mktemp)"
trap 'rm -f "$MAN_L" "$MAN_R" "${TMP_TAR:-}" "$MAN_L.diffs" "$MAN_L.after" "$MAN_R.snap"' EXIT
manifest_local > "$MAN_L"
manifest_remote | grep -E '^[a-f0-9]{64}	' > "$MAN_R"
[ -s "$MAN_L" ] || { echo "GAGAL: repo tidak punya pb_hooks/pb_migrations?" >&2; exit 1; }
[ -s "$MAN_R" ] || { echo "GAGAL: manifest VM kosong — periksa path $REMOTE_APP" >&2; exit 1; }

awk -F'\t' '
  NR==FNR { want[$2]=$1; next }
  { have[$2]=$1 }
  END {
    for (p in want) {
      if (!(p in have))        print "BARU      " p;
      else if (have[p]!=want[p]) print "BERUBAH   " p;
    }
    for (p in have) if (!(p in want)) print "ORPHAN    " p " (hanya di VM, tidak disentuh skrip ini)";
  }' "$MAN_L" "$MAN_R" | sort > "$MAN_L.diffs" || true

N_PUSH=$(grep -cE '^(BARU|BERUBAH)' "$MAN_L.diffs" || true)
N_ORPHAN=$(grep -c '^ORPHAN' "$MAN_L.diffs" || true)

echo "=== drift repo vs $INSTANCE:$REMOTE_APP ==="
if [ -s "$MAN_L.diffs" ]; then sed 's/^/  /' "$MAN_L.diffs"; fi
printf 'berkas dikirim : %s\n' "$N_PUSH"
printf 'orphan di VM   : %s\n' "$N_ORPHAN"

if [ "$N_PUSH" = "0" ]; then
  echo "isi VM sudah sama dengan repo — tidak ada yang di-deploy."
  exit 0
fi
if [ "$APPLY" = "0" ]; then
  echo "STATUS: dry-run. Tambahkan --apply untuk mengirim $N_PUSH berkas."
  exit 0
fi

if [ -z "${PB_SU_EMAIL:-}" ] || [ -z "${PB_SU_PASSWORD:-}" ]; then
  if [ -f "$SU_ENV_FILE" ]; then set -a; . "$SU_ENV_FILE"; set +a; fi
fi
[ -n "${PB_SU_EMAIL:-}" ] && [ -n "${PB_SU_PASSWORD:-}" ] || {
  echo "GAGAL: gate smoke butuh PB_SU_EMAIL + PB_SU_PASSWORD (env atau $SU_ENV_FILE mode 600)." >&2
  exit 1
}
command -v node >/dev/null || { echo "GAGAL: node tidak ada di PATH, gate tidak bisa jalan." >&2; exit 1; }

run_gate() {
  if [ -n "${GATE_CMD:-}" ]; then
    eval "$GATE_CMD"
  else
    PB_SU_EMAIL="$PB_SU_EMAIL" PB_SU_PASSWORD="$PB_SU_PASSWORD" \
      node "$REPO_ROOT/tools/pb/pb-prod-smoke.mjs" "$PB_URL"
  fi
}

wait_health() { # wait_health <detik>
  local deadline=$(( $(date +%s) + ${1:-60} ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if gssh "curl -fsS -m 10 -o /dev/null $PB_URL/api/health" 2>/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}

TS="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE="/tmp/pb-deploy-$TS"
SNAP="$APP_DIR/releases/$TS"
TMP_TAR="$(mktemp /tmp/pb-deploy-XXXXXX.tar)"

echo "=== preflight ==="
gssh "docker inspect -f 'container_running={{.State.Running}}' $CONTAINER"
wait_health 20 || { echo "GAGAL: /api/health sudah merah SEBELUM deploy — berhenti, tidak ada yang diubah." >&2; exit 1; }

echo "=== bungkus + unggah ==="
(cd "$REPO_ROOT" && tar -cf "$TMP_TAR" pb_hooks pb_migrations)
gcloud compute scp "$TMP_TAR" "$INSTANCE:/tmp/pb-deploy-$TS.tar" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap \
  2> >(grep -Ev "$QUIET_STDERR" >&2)
SHA_L="$(sha256sum "$TMP_TAR" | awk '{print $1}')"
SHA_R="$(gssh "sha256sum /tmp/pb-deploy-$TS.tar" | awk '{print $1}')"
[ "$SHA_L" = "$SHA_R" ] || { echo "GAGAL: sha256 arsip beda setelah unggah." >&2; exit 1; }
gssh "rm -rf '$STAGE' && mkdir -p '$STAGE' && tar -xf /tmp/pb-deploy-$TS.tar -C '$STAGE'"
echo "unggah terverifikasi: sha256 $SHA_L"

echo "=== snapshot state VM -> $SNAP ==="
gssh "sudo install -d -m 700 '$SNAP' && \
      sudo tar -cf '$SNAP/.deploy-baseline.tar' -C $REMOTE_APP pb_hooks pb_migrations && \
      sudo sha256sum '$SNAP/.deploy-baseline.tar'"
gssh "sudo tar -tf '$SNAP/.deploy-baseline.tar' | grep -cv '/\$'" > "$MAN_R.snap" || true
echo "isi snapshot: $(cat "$MAN_R.snap") berkas"

restore_snap() {
  # tar -xf saja tidak cukup: berkas yang BARU ditulis deploy tidak ikut hilang,
  # jadi hook/migrasi sisa masih kebaca PocketBase. Direktori hasil deploy dipindah
  # ke *.rolledback-$TS (tidak dihapus), lalu snapshot dipasang ulang utuh.
  echo "=== ROLLBACK dari $SNAP/.deploy-baseline.tar ===" >&2
  if ! gssh "sudo tar -tf '$SNAP/.deploy-baseline.tar' >/dev/null && \
             sudo mv $REMOTE_APP/pb_hooks $REMOTE_APP/pb_hooks.rolledback-$TS && \
             sudo mv $REMOTE_APP/pb_migrations $REMOTE_APP/pb_migrations.rolledback-$TS && \
             sudo tar -xf '$SNAP/.deploy-baseline.tar' -C $REMOTE_APP && \
             sudo docker restart $CONTAINER"; then
    echo "GAGAL: perintah rollback error. State VM TIDAK terbukti kembali — cek manual." >&2
    return 1
  fi
  if ! wait_health 60; then echo "BAHAYA: /api/health tidak hijau setelah rollback." >&2; return 1; fi
  return 0
}

echo "=== pasang $N_PUSH berkas (additive: tidak ada penghapusan di VM) ==="
gssh "sudo rsync -a '$STAGE/pb_hooks/' $REMOTE_APP/pb_hooks/ && \
      sudo rsync -a '$STAGE/pb_migrations/' $REMOTE_APP/pb_migrations/"
manifest_remote | grep -E '^[a-f0-9]{64}	' > "$MAN_L.after"
if ! awk -F'\t' 'NR==FNR{want[$2]=$1;next} ($2 in want) && want[$2]!=$1 {print "BEDA "$2; bad=1} END{exit bad?1:0}' \
     "$MAN_L" "$MAN_L.after"; then
  echo "GAGAL: sha256 VM tidak sama dengan repo setelah pasang." >&2
  restore_snap
fi

echo "=== restart $CONTAINER (pb hook dimuat ulang; pb_migrations jalan saat boot) ==="
gssh "sudo docker restart $CONTAINER" >/dev/null
wait_health 60 || { echo "GAGAL: /api/health tidak hijau dalam 60s." >&2; restore_snap; }
gssh "docker ps --filter name=$CONTAINER --format '{{.Names}} {{.Status}}'"
gssh "sudo docker logs --tail 30 $CONTAINER 2>&1 | grep -iE 'migrat|error|panic|serving' | tail -8" || true

echo "=== gerbang smoke terhadap $PB_URL ==="
# Gate memanggil Gemini sungguhan dan menulis + menghapus baris smoke di produksi.
# Override dengan GATE_CMD kalau tidak diinginkan.
# CATATAN: GATE_CMD dievaluasi di shell ini. Bikin gate gagal dengan perintah yang
# KELUAR bukan 0 (mis. `false`), bukan `exit 1` — `exit` membunuh skrip ini lebih
# dulu sehingga rollback tidak pernah jalan (terjadi saat uji sandbox).
if ! run_gate; then
  echo "GAGAL: smoke merah setelah deploy." >&2
  restore_snap
  echo "=== gerbang ulang setelah rollback ===" >&2
  run_gate && echo "rollback terverifikasi hijau." >&2 || echo "BAHAYA: rollback juga merah — tangan manusia diperlukan." >&2
  exit 1
fi

gssh "sudo rm -rf '$STAGE' /tmp/pb-deploy-$TS.tar" >/dev/null 2>&1 || true
echo "=========================================================="
printf 'terkirim     : %s berkas -> %s:%s\n' "$N_PUSH" "$INSTANCE" "$REMOTE_APP"
printf 'rollback     : %s/.deploy-baseline.tar\n' "$SNAP"
printf 'health       : /api/health hijau\n'
printf 'gate         : pb-prod-smoke.mjs PASS\n'
echo "DEPLOY SELESAI DAN TERVERIFIKASI"
