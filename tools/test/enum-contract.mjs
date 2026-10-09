// Gate statis: nilai kategori yang dipakai UI/AI harus ada di select PocketBase.
// F-01 lahir karena tidak ada satu pun periksa yang membandingkan keduanya — verifier
// schema selalu menulis category "Study" sehingga nilai UI yang haram tidak pernah lewat.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const [snapshotFile] = readdirSync(join(ROOT, 'pb_migrations')).filter((f) => /collections_snapshot\.js$/.test(f))
if (!snapshotFile) {
  console.error('Snapshot koleksi tidak ditemukan di pb_migrations — gate ini tidak punya sumber kebenaran.')
  process.exit(1)
}
const raw = read(join('pb_migrations', snapshotFile))
const start = raw.indexOf('const snapshot = [')
const callAt = raw.indexOf('app.importCollections', start)
const closeAt = raw.lastIndexOf(']', callAt)
const collections = JSON.parse(raw.slice(raw.indexOf('[', start), closeAt + 1))
const categoryField = collections
  .find((c) => c.name === 'Tasks')
  ?.fields.find((f) => f.name === 'category')

if (!categoryField?.values?.length) {
  console.error('Kolom Tasks.category tidak berbentuk select bernilai tetap — periksa ulang migrasi.')
  process.exit(1)
}
const allowed = categoryField.values
console.log(`Tasks.category (sumber kebenaran, ${snapshotFile}): ${allowed.join(', ')}`)

const idsIn = (file, decl) => {
  const src = read(file)
  const block = src.slice(src.indexOf(decl))
  return [...block.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1])
}
const keysIn = (file, decl) => {
  const src = read(file)
  const block = src.slice(src.indexOf(decl), src.indexOf('};', src.indexOf(decl)))
  return [...block.matchAll(/^\s{2}([A-Za-z]+):\s*'/gm)].map((m) => m[1])
}
const filtersIn = (file) => {
  const src = read(file)
  const from = src.indexOf('const FILTERS')
  const block = src.slice(from, src.indexOf(']', from))
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((v) => v !== 'All Tasks')
}
const listIn = (file, name) => {
  const src = read(file)
  const from = src.indexOf(`const ${name} = [`)
  if (from === -1) return []
  const block = src.slice(from, src.indexOf(']', from))
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
}
const promptIn = (file) => {
  const src = read(file)
  const m = src.match(/Category must be one of: ([^.]+)\./)
  return m ? m[1].split(',').map((s) => s.trim()) : []
}

const SOURCES = [
  ['lib/taskContract.ts', 'const TASK_CATEGORIES = [', (f) => listIn(f, 'TASK_CATEGORIES')],
  ['app/(tabs)/schedule.tsx', "const CATEGORIES = [", (f) => idsIn(f, 'const CATEGORIES = [')],
  ['app/edit-task.tsx', "const CATEGORIES = [", (f) => idsIn(f, 'const CATEGORIES = [')],
  ['app/(tabs)/timeline.tsx', 'CATEGORY_COLORS', (f) => keysIn(f, 'const CATEGORY_COLORS')],
  ['app/(tabs)/timeline.tsx', 'FILTERS', (f) => filtersIn(f)],
  ['lib/gemini.ts', 'prompt AutoPlan', (f) => promptIn(f)],
]

let bad = 0
for (const [file, label, get] of SOURCES) {
  const values = get(file)
  const illegal = values.filter((v) => !allowed.includes(v))
  if (!values.length) {
    console.log(`SKIP ${file} :: ${label} (pola tidak ketemu — periksa script ini kalau file berubah)`)
    continue
  }
  if (illegal.length) {
    bad++
    console.log(`RED  ${file} :: ${label} :: ${illegal.join(', ')} tidak ada di Tasks.category`)
  } else {
    console.log(`GREEN ${file} :: ${label} :: ${values.join(', ')}`)
  }
}
// Kontrak kedua (T-21): Workspace_Events.event_type.
// Sumber kebenarannya BUKAN snapshot — event_type ditegakkan lewat `pattern` pada migrasi
// (text -> select akan me-DROP kolom, jadi pilih pattern). Tanpa bagian ini, menambah nilai
// event di app/focus.tsx tidak akan terdeteksi sampai server menolaknya di perangkat.
const MIG_DIR = join(ROOT, 'pb_migrations')
const migrasiEv = readdirSync(MIG_DIR)
  .filter((f) => /workspace_events.*\.js$/.test(f))
  .sort()
const fileEv = migrasiEv.length ? `pb_migrations/${migrasiEv[migrasiEv.length - 1]}` : null
if (!fileEv) {
  console.error('Migrasi Workspace_Events tidak ditemukan — kontrak event_type tidak punya sumber kebenaran.')
  process.exit(1)
}
const srcEv = read(fileEv)
const allowedEv = listIn(fileEv, 'EVENTS')
const sentinel = (srcEv.match(/const SENTINEL = '([^']+)'/) || [])[1] || null
if (!allowedEv.length || !sentinel) {
  console.error(`${fileEv}: EVENTS atau SENTINEL tidak terbaca — periksa pola script ini.`)
  process.exit(1)
}
const unionEv = (() => {
  const m = read('app/focus.tsx').match(/type:\s*((?:'[A-Z_]+'\s*\|?\s*)+)/)
  return m ? [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]) : []
})()
if (!unionEv.length) {
  console.error('app/focus.tsx: union tipe event_type tidak terbaca — periksa pola script ini.')
  process.exit(1)
}
console.log(`Workspace_Events.event_type (sumber kebenaran, ${fileEv}): ${allowedEv.join(', ')} + sentinel ${sentinel}`)
for (const v of unionEv.filter((x) => !allowedEv.includes(x))) {
  bad++
  console.log(`RED  app/focus.tsx :: union :: ${v} tidak ada di pattern server -> semua event jenis itu ditolak 400`)
}
for (const v of allowedEv.filter((x) => !unionEv.includes(x) && x !== sentinel)) {
  bad++
  console.log(`RED  ${fileEv} :: pattern :: ${v} diizinkan server tapi tidak pernah dikirim aplikasi -> periksa cabang yang berubah`)
}
if (unionEv.includes(sentinel)) {
  bad++
  console.log(`RED  app/focus.tsx :: menulis sentinel ${sentinel} (penanda baris warisan migrasi)`)
}
if (!bad) console.log(`GREEN app/focus.tsx :: union :: ${unionEv.join(', ')} = persis pattern (${allowedEv.length} nilai)`)

console.log(bad ? `\n${bad} sumber memakai nilai kategori yang ditolak backend.` : '\nSemua sumber cocok dengan skema.')
process.exit(bad ? 1 : 0)
