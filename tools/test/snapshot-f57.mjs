// F-57: membuktikan snapshot koleksi BERDIRI SENDIRI. Yang dinilai adalah install fresh
// yang hanya menerima 1790909763_collections_snapshot.js (di CI: container kedua), jadi
// kalau ada aturan akses atau kolom yang hidup hanya karena migrasi sesudah snapshot,
// gate ini merah — bukan sekadar laporan bahwa "rantai penuh jalan" (itu sudah dijamin
// job skema). Diperukur 2026-10-09 sebelum resnap: snapshot lama menghasilkan createRule
// `@request.auth.id != ""` dan Workspace_Events 7 kolom, sementara rantai penuh punya
// createRule kepemilikan dan 8 kolom.
//
// Jalan lokal (backend snapshot-saja, port 8097):
//   PB_SNAP_URL=http://127.0.0.1:8097 PB_SU_PASSWORD=... node tools/test/snapshot-f57.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import PocketBase from 'pocketbase'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = process.env.PB_SNAP_URL || 'http://127.0.0.1:8097'
if (/elarisnoir/.test(BASE)) {
  console.error('DILARANG menjalankan gerbang snapshot ke backend produksi. PB_SNAP_URL harus 127.0.0.1.')
  process.exit(1)
}
const SU_EMAIL = process.env.PB_SU_EMAIL || 'ci@local.test'
const SU_PW = process.env.PB_SU_PASSWORD || ''
const PW = process.env.PT_SEED_PASSWORD || 'Seed-local-1234'

const die = (pesan, detail) => {
  console.error(`${pesan}`)
  if (detail) console.error(`Rinciannya: ${detail}`)
  console.error('Yang harus ada: install fresh 0.40.4 yang hanya memuat file snapshot:\n' +
    '  mkdir -p /tmp/pb-snap-only && cp pb_migrations/*collections_snapshot.js /tmp/pb-snap-only/\n' +
    '  docker run -d --name pt-pb-snap -p 127.0.0.1:8097:8090 \\\n' +
    '    -e PB_ADMIN_EMAIL=ci@local.test -e PB_ADMIN_PASSWORD=<password-siap-buang> \\\n' +
    '    -v /tmp/pb-snap-only:/pb_migrations ghcr.io/muchobien/pocketbase:0.40.4')
  process.exit(1)
}

// Guard ini ada karena kegagalan pertamanya menipu: tanpa PB_SU_PASSWORD, server membalas
// "An error occurred while validating the submitted data" dan gate menyalahkan backendnya.
if (!SU_PW) die('PB_SU_PASSWORD belum diisi di environment',
  'Nilai bawaan sengaja kosong (tidak ada rahasia di kode). Isikan sama dengan PB_ADMIN_PASSWORD container snapshot — di CI lihat env job `schema`.')

let red = 0
const line = (state, nama, pesan) => {
  if (state === 'RED') red++
  console.log(`${state.padEnd(4)} ${nama.padEnd(17)} ${pesan}`)
}

const sehat = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
if (!sehat || !sehat.ok) die(`Backend snapshot tidak hidup di ${BASE}`, sehat ? `HTTP ${sehat.status}` : 'tidak ada respons')

const su = new PocketBase(BASE)
su.autoCancellation(false)
try {
  await su.collection('_superusers').authWithPassword(SU_EMAIL, SU_PW)
} catch (err) {
  die(`Superuser tidak bisa masuk di ${BASE} sebagai ${SU_EMAIL}`, err.message)
}
const TOKEN = su.authStore.token

// ── sumber kebenaran: file snapshot di repo, dibaca sebagai data ───────────────────────
const [berkas] = readdirSync(join(ROOT, 'pb_migrations')).filter((f) => /collections_snapshot\.js$/.test(f))
if (!berkas) die('Tidak ada file *collections_snapshot.js di pb_migrations')
const mentah = readFileSync(join(ROOT, 'pb_migrations', berkas), 'utf8')
const arr = mentah.match(/const snapshot = (\[[\s\S]*?\n  \];)/)
if (!arr) die(`${berkas} tidak lagi berbentuk "const snapshot = [...]" — gerbang ini kehilangan sumbernya`)
let file
try {
  file = JSON.parse(arr[1].replace(/;$/, ''))
} catch (err) {
  die(`${berkas} berisi array snapshot yang bukan JSON utuh: ${err.message}`, 'gate tidak boleh diam-diam hijau; perbaiki bentuk file, bukan gate')
}

const urutKunci = (v) => {
  if (Array.isArray(v)) return v.map(urutKunci)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = urutKunci(v[k])
    return out
  }
  return v
}
// created/updated adalah stempel waktu baris, bukan skema.
const normalisir = (c) => {
  const { created, updated, ...sisa } = urutKunci(c)
  return sisa
}

const resp = await fetch(`${BASE}/api/collections?perPage=200`, { headers: { Authorization: TOKEN } })
if (!resp.ok) die('Gagal membaca daftar koleksi dari server', `HTTP ${resp.status}`)
const live = (await resp.json()).items
const liveByName = new Map(live.map((c) => [c.name, normalisir(c)]))
const fileByName = new Map(file.map((c) => [c.name, normalisir(c)]))

{
  const beda = []
  for (const nama of fileByName.keys()) {
    const a = fileByName.get(nama)
    const b = liveByName.get(nama)
    if (!b) { beda.push(`${nama}: ada di file, tidak dibuat server`); continue }
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    for (const k of ['createRule', 'listRule', 'viewRule', 'updateRule', 'deleteRule', 'type', 'system']) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        beda.push(`${nama}.${k}: file=${JSON.stringify(a[k])} server=${JSON.stringify(b[k])}`)
      }
    }
    if (JSON.stringify(a.indexes) !== JSON.stringify(b.indexes)) beda.push(`${nama}.indexes beda`)
    const fb = new Map(b.fields.map((f) => [f.name, JSON.stringify(f)]))
    for (const f of a.fields) {
      const punya = fb.get(f.name)
      if (!punya) beda.push(`${nama}.${f.name}: ada di file, tidak dibuat server`)
      else if (punya !== JSON.stringify(f)) beda.push(`${nama}.${f.name}: definisi beda`)
    }
    const fa = new Set(a.fields.map((f) => f.name))
    for (const fn of fb.keys()) if (!fa.has(fn)) beda.push(`${nama}.${fn}: dibuat server, tidak ada di file`)
  }
  // `users` dibuat PocketBase sendiri dan memang tidak dibawa snapshot; kalau ia hilang,
  // install fresh tidak lagi sama bentuknya dengan yang dipakai seluruh alat.
  for (const nama of ['Profiles', 'Tasks', 'Focus_Sessions', 'Workspace_Events', 'users', '_superusers']) {
    if (!liveByName.has(nama)) beda.push(`koleksi ${nama} tidak ada di install fresh`)
  }
  if (beda.length) {
    line('RED', 'skema==snapshot', `${beda.length} penyimpangan: ${beda.slice(0, 8).join(' | ')}`)
  } else {
    line('GREEN', 'skema==snapshot',
      `${fileByName.size} koleksi file = install fresh yang hanya memuat ${berkas}, butir demi butir (rule, indeks, ${[...fileByName.values()].reduce((n, c) => n + c.fields.length, 0)} field); server punya ${live.length} koleksi termasuk ${live.length - fileByName.size} bawaan`)
  }
}

// ── perilaku: rule kepemilikan harus hidup tanpa 1790909800 ────────────────────────────
const buatAkun = async (tag) => {
  const e = `f57-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@pickertime.test`
  await su.collection('Profiles').create({
    email: e, password: PW, passwordConfirm: PW, full_name: `F57 ${tag}`,
    role: 'Professional', emailVisibility: true,
  })
  return e
}
const emailA = await buatAkun('a')
const emailB = await buatAkun('b')
const pbA = new PocketBase(BASE)
pbA.autoCancellation(false)
await pbA.collection('Profiles').authWithPassword(emailA, PW)
const idA = pbA.authStore.record.id
const idB = (await su.collection('Profiles').getFirstListItem(`email = "${emailB}"`)).id

const tulis = async (koleksi, body, token) => {
  const r = await fetch(`${BASE}/api/collections/${koleksi}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: JSON.stringify(body),
  })
  const teks = await r.text()
  return { status: r.status, body: r.ok ? JSON.parse(teks) : teks.slice(0, 70) }
}

const iso = (menit) => new Date(Date.now() + menit * 60000).toISOString()
const PAYLOAD = {
  Tasks: (u) => ({ user: u, title: 'F57', description: 'probe', category: 'Study', priority: 'Medium', start_time: iso(60), end_time: iso(120), duration_minutes: 60, is_completed: false, has_alarm: false, alarm_minutes_before: 10 }),
  Focus_Sessions: (u) => ({ user: u, duration_seconds: 60, completed: true }),
  Workspace_Events: (u) => ({ user: u, event_type: 'START_FOCUS', payload: '{"probe":true}', is_processed: false }),
}

const dibuat = []
{
  const salah = []
  const angka = []
  for (const [koleksi, buat] of Object.entries(PAYLOAD)) {
    const asing = await tulis(koleksi, buat(idB), pbA.authStore.token)
    if (asing.status !== 400) salah.push(`${koleksi} atas nama user lain -> HTTP ${asing.status}; harapan 400`)
    const anonim = await tulis(koleksi, buat(idA), null)
    if (anonim.status === 200) salah.push(`${koleksi} boleh ditulis tanpa login -> HTTP 200`)
    const milik = await tulis(koleksi, buat(idA), pbA.authStore.token)
    if (milik.status !== 200) {
      salah.push(`${koleksi} atas nama sendiri -> HTTP ${milik.status} (${milik.body}); harapan 200 — kontrol positif, tanpa ini gerbang hijau palsu`)
    } else {
      dibuat.push([koleksi, milik.body.id])
    }
    angka.push(`${koleksi}: asing=${asing.status} anonim=${anonim.status} milik=${milik.status}`)
  }
  const eventKaum = await tulis('Workspace_Events', { user: idA, event_type: 'BEBAS_SAJA', payload: '{}' }, pbA.authStore.token)
  if (eventKaum.status === 200) salah.push('event_type menerima teks di luar pattern — pengetatan #3 tidak ikut ke snapshot')
  if (salah.length) line('RED', 'rule fresh', `${salah.length} penyimpangan: ${salah.join(' | ')}`)
  else line('GREEN', 'rule fresh', `${angka.length} koleksi ditolak lintas user (400) & anonim (${angka.join(', ')}); event_type haram -> ${eventKaum.status}; tulis milik sendiri tetap 200`)
}

for (const [koleksi, id] of dibuat) await su.collection(koleksi).delete(id).catch(() => {})
for (const e of [emailA, emailB]) {
  const r = await su.collection('Profiles').getFirstListItem(`email = "${e}"`).catch(() => null)
  if (r) await su.collection('Profiles').delete(r.id).catch(() => {})
}
console.log(`probe dibersihkan: ${dibuat.length} record, 2 akun`)
console.log(red ? `\n${red} gerbang snapshot merah di ${BASE}` : `\nsnapshot berdiri sendiri di ${BASE}.`)
process.exit(red ? 1 : 0)
