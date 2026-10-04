#!/usr/bin/env bash
# Uji ketahanan agen deploy VM (T-04..T-07 pada TODO.md M9).
#
# Ide: kirim perintah yang *cacat atau berbahaya* ke antrean produksi, lalu buktikan
# agen menolaknya SEBELUM ada perubahan state. Validasi agen terjadi sebelum unduhan
# (untuk cacat bentuk) dan sebelum gerbang/restart (untuk cacat isi arsip), jadi
# tidak ada peluang container produksi disentuh oleh pesan-pesan ini.
#
# Semua artefak uji dibuat jinak: symlink menunjuk /etc/hostname, entri asing bernama
# other/probe.js (bukan .pb.js, jadi tidak akan pernah dimuat PocketBase), dan nama
# file memakai prefiks probe-nt- yang dibersihkan di akhir.
#
# Kering (default) hanya mencetak rencana. --apply benar-benar memublikasikan.
# Butuh: gcloud yang terautentikasi untuk PROJECT, dan akses IAP ke VM untuk sidik state.
set -euo pipefail

PROJECT="${PROJECT:-config-agentic-ubuntu}"
BUCKET_NAME="${BUCKET_NAME:-pickertime-pb-deploys}"
TOPIC="projects/${PROJECT}/topics/pickertime-pb-deploy"
RESULTS_SUB="projects/${PROJECT}/subscriptions/pickertime-pb-deploy-results-to-gha"
VM="${VM:-hermes-openclaw-vm}"
ZONE="${ZONE:-us-central1-a}"
DEADLINE_SEC="${DEADLINE_SEC:-1500}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

STAMP=$(date -u +%H%M%S)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

say() { printf 'probe-nt: %s\n' "$*"; }

vm_state() { # sidik state VM: sha isi terpasang + waktu start container + jumlah release
  gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap --command='
    hs=$(sudo sha256sum /opt/pickertime/app/pb_hooks/*.pb.js | sha256sum | cut -c1-12)
    ms=$(sudo ls /opt/pickertime/app/pb_migrations | sha256sum | cut -c1-12)
    st=$(docker inspect -f "{{.State.StartedAt}}" pickertime-pocketbase)
    rl=$(sudo ls -1 /opt/pickertime/releases | wc -l)
    q=$(sudo ls -1 /opt/pickertime/app | grep -c "rolledback-" || true)
    echo "hooks=$hs migrations=$ms started=$st releases=$rl quarantine=$q"
  ' 2>/dev/null | tail -1
}

build_tars() {
  mkdir -p "$WORK/stage/pb_migrations" "$WORK/stage/other"
  ln -s /etc/hostname "$WORK/stage/pb_migrations/probe-link-$STAMP"
  echo "// probe asing, bukan .pb.js" > "$WORK/stage/other/probe-$STAMP.js"
  tar --no-recursion --format=ustar --owner=0 --group=0 -cf "$WORK/symlink.tar" \
    -C "$WORK/stage" "pb_migrations/probe-link-$STAMP"
  tar --no-recursion --format=ustar --owner=0 --group=0 -cf "$WORK/foreign.tar" \
    -C "$WORK/stage" "other/probe-$STAMP.js"
  tar --no-recursion --format=ustar -cf "$WORK/empty.tar" -T /dev/null
  python3 - "$WORK/traversal.tar" <<'PY'
import io, sys, tarfile
path = sys.argv[1]
t = tarfile.open(path, "w", format=tarfile.GNU_FORMAT)
ti = tarfile.TarInfo("pb_hooks/../../probe.txt")
ti.size = 1
t.addfile(ti, io.BytesIO(b"x"))
t.close()
PY
  echo "// artefak utuh tapi sha salah" > "$WORK/stage/pb_migrations/probe-ok-$STAMP.js"
  tar --no-recursion --format=ustar --owner=0 --group=0 -cf "$WORK/shamismatch.tar" \
    -C "$WORK/stage" "pb_migrations/probe-ok-$STAMP.js"
  for f in symlink foreign empty traversal shamismatch; do
    printf '%s.tar: entries=%s\n' "$f" "$(tar -tf "$WORK/$f.tar" | wc -l)"
  done
}

upload() { # upload <nama-tanpa-ext> -> set global SHA/SIZE/OBJECT
  local name=$1
  OBJECT="inbox/probe-nt-$STAMP-$name.tar"
  mv "$WORK/$name.tar" "$WORK/up.tar"
  gcloud storage cp --quiet "$WORK/up.tar" "gs://$BUCKET_NAME/$OBJECT"
  SHA=$(sha256sum "$WORK/up.tar" | cut -d' ' -f1)
  SIZE=$(wc -c < "$WORK/up.tar")
}

if [ -z "${ACCESS_TOKEN:-}" ]; then
  command -v gcloud >/dev/null || { echo "gcloud tidak ada di PATH dan ACCESS_TOKEN tidak diset" >&2; exit 1; }
  ACCESS_TOKEN=$(gcloud auth print-access-token)
fi

api() { # api <method> <path> <body> -> body response
  local method=$1 path=$2 payload=$3 out code body
  out=$(curl -sS -m 30 -w '\n%{http_code}' -X "$method" \
    -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
    -d "$payload" "https://pubsub.googleapis.com/v1/${path}")
  code=$(printf '%s' "$out" | tail -n1)
  body=$(printf '%s' "$out" | head -n -1)
  if [ "$code" != "200" ]; then
    echo "http=$code untuk $method $path body=$(printf '%.200s' "$body")" >&2
    return 1
  fi
  printf '%s' "$body"
}

publish() { # publish <deploy_id> <json|raw>
  local id=$1 payload=$2
  if [ "$APPLY" = "1" ]; then
    # Base64 encode the payload, matching format dari publish-pb-deploy.sh
    local b64
    b64=$(printf '%s' "$payload" | base64 -w0)
    api POST "${TOPIC}:publish" "$(jq -cn --arg d "$b64" '{messages:[{data:$d}]}')" >/dev/null
    say "kirim $id"
  else
    say "(kering) akan kirim $id :: $payload"
  fi
}

msg() { jq -cn --arg id "$1" --arg act "${2:-apply}" --arg obj "${3:-}" --arg sha "${4:-}" \
  --argjson sz "${5:-0}" '{deploy_id:$id,action:$act,object:$obj,sha256:$sha,size:$sz}'; }

wait_results() {
  local want=$1 seen=0 waited=0 out
  : > "$WORK/results.txt"
  while [ "$seen" -lt "$want" ] && [ "$waited" -lt "$DEADLINE_SEC" ]; do
    # Gunakan REST API untuk pull, lebih mudah diparse daripada gcloud
    local resp
    resp=$(api POST "${RESULTS_SUB}:pull" '{"maxMessages":5,"returnImmediately":true}' 2>/dev/null) || true
    if [ -n "$resp" ]; then
      local count
      count=$(printf '%s' "$resp" | jq -r 'if .receivedMessages then (.receivedMessages|length) else 0 end')
      if [ "$count" -gt 0 ]; then
        for i in $(seq 0 $((count - 1))); do
          local ack_id data decoded deploy_id msg_text
          ack_id=$(printf '%s' "$resp" | jq -r ".receivedMessages[$i].ackId")
          data=$(printf '%s' "$resp" | jq -r ".receivedMessages[$i].message.data")
          decoded=$(printf '%s' "$data" | base64 -d 2>/dev/null || echo "")
          # Ack semua pesan, tapi hanya simpan yang sesuai STAMP
          api POST "${RESULTS_SUB}:acknowledge" "$(jq -cn --arg a "$ack_id" '{ackIds:[$a]}')" >/dev/null 2>&1 || true
          if [ -n "$decoded" ]; then
            deploy_id=$(printf '%s' "$decoded" | jq -r '.deploy_id // empty' 2>/dev/null || echo "")
            msg_text=$(printf '%s' "$decoded" | jq -r '.message // empty' 2>/dev/null || echo "")
            # Terima jika: deploy_id mengandung STAMP, ATAU deploy_id kosong dan pesan tentang JSON invalid
            if printf '%s' "$deploy_id" | grep -qF "$STAMP" || \
               { [ -z "$deploy_id" ] && printf '%s' "$msg_text" | grep -qF "JSON valid"; }; then
              printf '%s\n' "$decoded" >> "$WORK/results.txt"
              echo "DEBUG: received [$decoded]" >&2
              seen=$((seen + 1))
            else
              echo "DEBUG: skip [$deploy_id :: $msg_text]" >&2
            fi
          fi
        done
      fi
    fi
    [ "$seen" -lt "$want" ] && sleep 20 && waited=$((waited + 20))
  done
  echo "hasil_ditangkap=$seen/$want"
}

report() {
  local ok=0 bad=0 line id frag got
  while IFS='|' read -r id frag; do
    [ -n "$id" ] || continue
    # Cari by deploy_id, atau by message fragment jika deploy_id kosong (untuk notjson)
    got=$(jq -r --arg id "$id" --arg frag "$frag" \
      'select(.deploy_id==$id or (.deploy_id=="" and (.message | contains($frag)))) | "\(.status) \(.message)"' \
      "$WORK/results.txt" 2>/dev/null | tail -1)
    if printf '%s' "$got" | grep -qF "$frag"; then
      echo "PASS $id :: $got"; ok=$((ok + 1))
    else
      echo "GAGAL $id :: diharapkan '$frag' dapat '$got'"; bad=$((bad + 1))
    fi
  done < "$WORK/expect.txt"
  echo "=== hijau=$ok merah=$bad ==="
  [ "$bad" -eq 0 ]
}

say "mode=$([ "$APPLY" = 1 ] && echo APPLY || echo KERING)"

if [ "$APPLY" = "1" ]; then
  say "drain: membersihkan antrean hasil lama..."
  drain_count=0
  while true; do
    resp=$(api POST "${RESULTS_SUB}:pull" '{"maxMessages":10,"returnImmediately":true}' 2>/dev/null) || break
    count=$(printf '%s' "$resp" | jq -r 'if .receivedMessages then (.receivedMessages|length) else 0 end')
    [ "$count" = "0" ] && break
    for i in $(seq 0 $((count - 1))); do
      ack_id=$(printf '%s' "$resp" | jq -r ".receivedMessages[$i].ackId")
      api POST "${RESULTS_SUB}:acknowledge" "$(jq -cn --arg a "$ack_id" '{ackIds:[$a]}')" >/dev/null 2>&1 || true
      drain_count=$((drain_count + 1))
    done
  done
  say "drain: $drain_count pesan lama dibuang"
fi

say "sebelum: $(vm_state)"
build_tars

: > "$WORK/expect.txt"
add_expect() { printf '%s|%s\n' "$1" "$2" >> "$WORK/expect.txt"; }

# 1-5: ditolak sebelum ada unduhan apa pun
publish "nt-$STAMP-idcharset" "$(msg "nt-$STAMP-idcharset;rm -rf /" apply inbox/x.tar "$(printf 'a%.0s' {1..64})" 100)"
add_expect "nt-$STAMP-idcharset;rm -rf /" "deploy_id tidak valid"
publish "nt-$STAMP-notjson" "ini jelas bukan json"
add_expect "nt-$STAMP-notjson" "pesan bukan JSON valid"
publish "nt-$STAMP-oversize" "$(msg "nt-$STAMP-oversize" apply inbox/x.tar "$(printf 'b%.0s' {1..64})" 20971521)"
add_expect "nt-$STAMP-oversize" "artefak terlalu besar"
publish "nt-$STAMP-badsha" "$(msg "nt-$STAMP-badsha" apply inbox/x.tar "zz-not-hex" 100)"
add_expect "nt-$STAMP-badsha" "sha256 tidak berbentuk"
publish "nt-$STAMP-badobject" "$(msg "nt-$STAMP-badobject" apply "../../etc/passwd" "$(printf 'c%.0s' {1..64})" 100)"
add_expect "nt-$STAMP-badobject" "objek harus inbox/"
publish "nt-$STAMP-badaction" "$(msg "nt-$STAMP-badaction" formatkan)"
add_expect "nt-$STAMP-badaction" "action tak dikenal"

# 6-9: artefak nyata, ditolak saat isi arsip/diverifikasi
upload shamismatch
publish "nt-$STAMP-shamismatch" "$(jq -cn --arg id "nt-$STAMP-shamismatch" --arg o "$OBJECT" \
  --arg s "$(printf 'd%.0s' {1..64})" --argjson z "$SIZE" \
  '{deploy_id:$id,action:"apply",object:$o,sha256:$s,size:$z}')"
add_expect "nt-$STAMP-shamismatch" "sha256 tidak cocok"

upload symlink
publish "nt-$STAMP-symlink" "$(msg "nt-$STAMP-symlink" apply "$OBJECT" "$SHA" "$SIZE")"
add_expect "nt-$STAMP-symlink" "arsip mengandung direktori/symlink/device"

upload traversal
publish "nt-$STAMP-traversal" "$(msg "nt-$STAMP-traversal" apply "$OBJECT" "$SHA" "$SIZE")"
add_expect "nt-$STAMP-traversal" "arsip mengandung path berisiko"

upload foreign
publish "nt-$STAMP-foreign" "$(msg "nt-$STAMP-foreign" apply "$OBJECT" "$SHA" "$SIZE")"
add_expect "nt-$STAMP-foreign" "entri di luar pb_hooks/pb_migrations"

upload empty
publish "nt-$STAMP-empty" "$(msg "nt-$STAMP-empty" apply "$OBJECT" "$SHA" "$SIZE")"
add_expect "nt-$STAMP-empty" "arsip kosong"

nexp=$(wc -l < "$WORK/expect.txt")
say "kirim selesai, target hasil=$nexp"
[ "$APPLY" = 1 ] || { say "kering: tidak ada yang dipublikasikan, henti di sini"; exit 0; }

wait_results "$nexp"
report
say "sesudah: $(vm_state)"
