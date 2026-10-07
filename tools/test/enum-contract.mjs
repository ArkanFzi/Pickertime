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
const promptIn = (file) => {
  const src = read(file)
  const m = src.match(/Category must be one of: ([^.]+)\./)
  return m ? m[1].split(',').map((s) => s.trim()) : []
}

const SOURCES = [
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
console.log(bad ? `\n${bad} sumber memakai nilai kategori yang ditolak backend.` : '\nSemua sumber cocok dengan skema.')
process.exit(bad ? 1 : 0)
