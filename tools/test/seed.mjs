// Seed akun + tugas untuk loop uji perangkat. Hanya boleh menyentuh backend uji lokal.
// Password di bawah itu kredensial account sekali-pakai di container sementara (pb_data
// tidak di-git dan container dibuang) — bukan kredensial produksi, dan tidak dipakai
// di kode client. Override lewat PT_SEED_PASSWORD kalau mau.
import PocketBase from 'pocketbase'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const URL = process.env.PB_TEST_URL || 'http://127.0.0.1:8099'
const EMAIL = process.env.PT_SEED_EMAIL || 'seed@pickertime.test'
const PASSWORD = process.env.PT_SEED_PASSWORD || 'Seed-local-1234'

if (/elarisnoir/.test(URL)) {
  console.error('DILARANG seed ke backend produksi. PB_TEST_URL harus 127.0.0.1.')
  process.exit(1)
}

const pb = new PocketBase(URL)
pb.autoCancellation(false)

try {
  await pb.collection('Profiles').authWithPassword(EMAIL, PASSWORD)
  console.log(`login akun seed yang sudah ada :: ${EMAIL}`)
} catch {
  await pb.collection('Profiles').create({
    email: EMAIL, password: PASSWORD, passwordConfirm: PASSWORD,
    full_name: 'Seed User', role: 'Professional', focus_goal: 'Deep work',
    energy_pref: 'Morning', emailVisibility: true,
  })
  await pb.collection('Profiles').authWithPassword(EMAIL, PASSWORD)
  console.log(`akun seed baru dibuat :: ${EMAIL}`)
}
const userId = pb.authStore.record.id

// Idempoten: menjalankan seed dua kali tidak boleh menumpuk duplikat. Aman karena URL
// produksi sudah ditolak di atas dan penghapusan dibatasi ke record milik akun seed ini.
for (const col of ['Tasks', 'Focus_Sessions']) {
  const existing = await pb.collection(col).getFullList({ filter: `user = "${userId}"` })
  for (const rec of existing) await pb.collection(col).delete(rec.id)
  console.log(`bersih ${col} :: ${existing.length} record lama dihapus`)
}

const at = (min) => new Date(Date.now() + min * 60000)
const iso = (d) => d.toISOString()

const TASKS = [
  { label: 'alarm-3-menit', category: 'Work', priority: 'High', title: 'Kerjakan slide laporan', minutesFromNow: 3, duration: 25, alarmBefore: 10, note: 'uji A-1/A-2: notifikasi tepat waktu' },
  { label: 'energy-7-menit', category: 'Study', priority: 'Medium', title: 'Review bab 4', minutesFromNow: 7, duration: 45, alarmBefore: 10, note: 'berada di jendela energi' },
  { label: 'jauh-20-menit', category: 'Personal', priority: 'Low', title: 'Balas email klien', minutesFromNow: 20, duration: 30, alarmBefore: 5, note: 'di luar jendela dekat' },
  { label: 'tumpang-tindih', category: 'Work', priority: 'Medium', title: 'Sprint planning', minutesFromNow: 8, duration: 60, alarmBefore: 10, note: 'uji deteksi konflik & findNextAvailableSlot' },
  { label: 'enum-Creative', category: 'Creative', priority: 'Medium', title: 'Edit video mentah', minutesFromNow: 35, duration: 60, alarmBefore: 10, note: 'EVIDENCE F-01: kategori UI tidak ada di select PocketBase' },
]

const created = []
const rejected = []
for (const t of TASKS) {
  const start = at(t.minutesFromNow)
  start.setSeconds(0, 0)
  const end = new Date(start.getTime() + t.duration * 60000)
  const payload = {
    user: userId, title: t.title, description: t.note, category: t.category,
    priority: t.priority, start_time: iso(start), end_time: iso(end),
    duration_minutes: t.duration, is_completed: false, has_alarm: true,
    alarm_minutes_before: t.alarmBefore,
  }
  try {
    const rec = await pb.collection('Tasks').create(payload)
    created.push({ label: t.label, id: rec.id, start_time: rec.start_time, category: rec.category })
    console.log(`OK   ${t.label.padEnd(16)} start=${rec.start_time} category=${rec.category}`)
  } catch (err) {
    const detail = JSON.stringify(err?.data ?? {}).slice(0, 140)
    rejected.push({ label: t.label, category: t.category, status: err?.status ?? 0, detail })
    console.log(`FAIL ${t.label.padEnd(16)} HTTP ${err?.status} ${detail}`)
  }
}

// Satu sesi fokus kemarin supaya tab Insights tidak berangkat dari data nol.
try {
  await pb.collection('Focus_Sessions').create({ user: userId, duration_seconds: 1500, completed: true, created: iso(at(-1440)) })
  console.log('OK   Focus_Sessions   1 record kemarin (1500 dtk)')
} catch (err) {
  console.log(`FAIL Focus_Sessions   HTTP ${err?.status} ${JSON.stringify(err?.data ?? {}).slice(0, 120)}`)
}

mkdirSync(join(ROOT, 'tools/test/tmp'), { recursive: true })
writeFileSync(join(ROOT, 'tools/test/tmp/seed.json'), JSON.stringify({ url: URL, email: EMAIL, password: PASSWORD, userId, created, rejected, seededAt: new Date().toISOString() }, null, 2))

console.log('\n=== LOGIN DI PERANGKAT ===')
console.log(`URL    : ${URL} (sisi ponsel: http://127.0.0.1:8090 lewat adb reverse)`)
console.log(`email  : ${EMAIL}`)
console.log(`password: ${PASSWORD}`)
console.log(`task dibuat=${created.length} ditolak=${rejected.length}`)
for (const r of rejected) console.log(`  DITOLAK: ${r.label} category=${r.category} HTTP ${r.status}`)
