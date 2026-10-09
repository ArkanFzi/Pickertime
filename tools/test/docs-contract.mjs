// Gate dokumen (F-66, F-67, F-68 + kelas kegagalan F-54): apa yang ditulis di markdown harus
// sama dengan skema dan perkakas yang benar-benar ada. Alasan gate ini ada: CLAUDE.md dan
// GEMINI.md adalah file yang dibaca agen LAIN sebelum menyentuh repo, jadi satu nama koleksi
// yang salah huruf berarti agen itu kena 404 "Collection not found", satu tipe field yang salah
// berarti ia menulis payload yang ditolak server, dan satu anjuran node v18 membuat perkakas
// uji mati dengan `node: bad option` sebelum kontraknya sempat dinilai.
// Diperbaiki tanpa gate = dokumen akan bocor lagi.
//
// ID audit dipakai apa adanya: F-69 di action_plan adalah keputusan provider AI, jadi temuan
// versi node di dokumen dicatat di bawah F54 — kegagalan kelas sama, ID berbeda jangan dicuri.
//
// Sumber kebenaran dibaca dari repo, bukan dari ingatan:
//   pb_migrations/*collections_snapshot.js  -> nama koleksi, tipe field, nilai select, rule API
//   pb_migrations/<ts>_*.js sesudah snapshot -> hanya diperiksa supaya tidak memperkenalkan rule
//                                            yang hilang dari snapshot (F-57), bukan sumber kutipan
//   .nvmrc                                  -> versi node
//   root repo                               -> file *.example yang disebut dokumen
// (pola event_type Workspace_Events dinilai di gate lain: tools/test/enum-contract.mjs)
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

// ── sumber kebenaran 1: snapshot koleksi ───────────────────────────────────────────────
const [snapshotFile] = readdirSync(join(ROOT, 'pb_migrations')).filter((f) => /collections_snapshot\.js$/.test(f))
if (!snapshotFile) {
  console.error('Snapshot koleksi tidak ditemukan di pb_migrations — gate ini tidak punya sumber kebenaran.')
  process.exit(1)
}
const raw = read(join('pb_migrations', snapshotFile))
const start = raw.indexOf('const snapshot = [')
const callAt = raw.indexOf('app.importCollections', start)
const collections = JSON.parse(raw.slice(raw.indexOf('[', start), raw.lastIndexOf(']', callAt) + 1))

// Koleksi aplikasi: yang namanya tidak diawali "_" (itu tabel internals PocketBase).
const appCollections = collections.filter((c) => !c.name.startsWith('_'))
const NAMES = appCollections.map((c) => c.name)
if (NAMES.length !== 4) {
  console.error(`Diharapkan 4 koleksi aplikasi, snapshot punya ${NAMES.length}: ${NAMES.join(', ')}`)
  process.exit(1)
}
const fieldsByName = new Map()
for (const c of appCollections) {
  for (const f of c.fields) {
    if (!fieldsByName.has(f.name)) fieldsByName.set(f.name, [])
    fieldsByName.get(f.name).push({ collection: c.name, type: f.type, values: f.values || null })
  }
}
const selectValues = (nama) => {
  for (const c of appCollections) {
    const f = c.fields.find((x) => x.name === nama && x.values?.length)
    if (f) return f.values
  }
  return null
}

// ── sumber kebenaran 2: node ───────────────────────────────────────────────────────────
const NVM = read('.nvmrc').trim()
const NODE_MAJOR = Number(NVM.split('.')[0])

// ── sumber kebenaran 3: rule API ───────────────────────────────────────────────────
// Sejak resnap F-57 (2026-10-09) snapshot-lah yang memuat createRule kepemilikan (F-03).
// Sebelum itu gate ini harus mengakui migrasi 1790909800 sebagai sumber tambahan, dan
// batasnya ditulis jujur: yang dinilai "apakah teks rule PERNAH ada di skema". Sekarang
// rule yang boleh dikutip dokumen hanya rule yang ADA DI DALAM snapshot. Migrasi sesudah
// snapshot masih dibaca, tapi perannya berubah jadi penjaga: teks rule yang muncul di sana
// tanpa ada di snapshot berarti snapshot sudah tidak berdiri sendiri — lubang F-57 yang
// sama, dan gate ini mati dengan pesan, bukan diam-diam hijau.
const RULE_SET = new Set()
for (const c of appCollections) {
  for (const k of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) RULE_SET.add(c[k] ?? null)
}
const SNAP_TS = Number(snapshotFile.match(/^(\d+)/)[1])
const MIG_DIR = join(ROOT, 'pb_migrations')
const LUAR_SNAPSHOT = []
for (const f of readdirSync(MIG_DIR).filter((x) => /^\d+_.*\.js$/.test(x) && Number(x.match(/^(\d+)/)[1]) > SNAP_TS).sort()) {
  const srcMig = read(join('pb_migrations', f))
  const up = srcMig.split(/\}\s*,\s*\(app\)\s*=>/)[0] // hanya naik — bagian down memuat nilai lama
  for (const m of up.matchAll(/([A-Za-z]*Rule)\s*=\s*(?:'([^']*)'|"([^"]*)")/g)) {
    const nilai = m[2] ?? m[3]
    if (!RULE_SET.has(nilai)) LUAR_SNAPSHOT.push(`${f} :: ${m[1]} = ${JSON.stringify(nilai)}`)
  }
}
if (LUAR_SNAPSHOT.length) {
  console.error(`Snapshot tidak lagi berdiri sendiri (F-57) — rule hanya ada di migrasi sesudah snapshot:\n  ${LUAR_SNAPSHOT.join('\n  ')}\nResnap snapshot, jangan tambahkan sumber ke gate ini.`)
  process.exit(1)
}
const RULE_TULIS = [...RULE_SET].filter((r) => typeof r === 'string' && r.length > 0)

// ── allowlist: file yang boleh menyebut dunia lama ─────────────────────────────────────
// Setiap pengecualian harus punya alasan + ID temuan, supaya daftar ini tidak diam-diam
// melebarkan kelonggaran. Gate tanpa allowlist yang dijelaskan = gate yang akan dinonaktifkan.
const EXCLUDE = [
  ['docs/04_audit/', 'audit mengutip kata yang sedang ditelan'],
  ['docs/archive/', 'arsip sejarah, memang berisi bentuk lama'],
  ['docs/10-github-history-purge.md', 'dok ini justru menghitung jejak era Appwrite/Supabase'],
  ['docs/03_automations/openclaw_bridge.md', 'masih ditulis terhadap Appwrite; nasibnya keputusan F-70'],
  ['docs/05_agent/', 'menyebut temuan lama sebagai tugas yang harus dikerjakan'],
  ['.claude/', 'prompt agen pihak ketiga, bukan dok skema repo ini'],
]
const excluded = (rel) => EXCLUDE.some(([p]) => rel.startsWith(p))

const tracked = execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: ROOT })
  .toString('utf8').split('\0').filter(Boolean)

// Sinonim tipe yang boleh ditulis manusia -> tipe snapshot.
const TYPE_ALIAS = {
  text: 'text', string: 'text', email: 'email', password: 'password',
  number: 'number', int: 'number', integer: 'number', float: 'number',
  bool: 'bool', boolean: 'bool',
  date: 'date', autodate: 'autodate', created: 'autodate', updated: 'autodate',
  json: 'json', jsonb: 'json', object: 'json',
  relation: 'relation', select: 'select', file: 'file', files: 'file',
}
// Kata yang memang dimaksudkan sebagai nama tipe (termasuk yang salah), supaya tanda kurung
// berupa prosa — `is_processed` (F-62 — ...) — tidak ikut dinilai. Tanpa daftar ini, gate
// menghukum setiap kurung setelah nama field dan orang akan melebarkan pengecualian.
const TYPE_WORDS = new Set([
  ...Object.keys(TYPE_ALIAS),
  ...new Set([...fieldsByName.values()].flat().map((t) => t.type)),
  // nama tipe dari dunia SQL/nama yang hampir benar: ini justru yang harus tertangkap.
  'datetime', 'timestamp', 'timestamptz', 'datetimeoffset', 'varchar', 'char', 'enum',
  'array', 'uuid', 'decimal', 'double', 'real', 'blob', 'bigint', 'smallint', 'time',
])
const tipeYangDiklaim = (klaim) => {
  const kata = String(klaim).toLowerCase().split(/[^a-z0-9]+/)[0]
  if (!TYPE_WORDS.has(kata)) return null
  return TYPE_ALIAS[kata] || kata
}

const TEMUAN = { F66: [], F67: [], F68: [], F54: [] }
const catat = (id, rel, baris, pesan) => TEMUAN[id].push(`${rel}:${baris} ${pesan}`)

const barisKe = (src, idx) => src.slice(0, idx).split('\n').length

for (const rel of tracked) {
  if (excluded(rel)) continue
  const src = read(rel)

  // F-66 — tidak ada lagi klaim Appwrite di dokumen aktif.
  for (const m of src.matchAll(/[Aa]ppwrite/g)) {
    const baris = src.split('\n')[barisKe(src, m.index) - 1]
    // Menolak Appwrite adalah kebenaran yang harus tetap ditulis; hanya klaim positif yang salah.
    if (/tidak ada\s+appwrite|appwrite\s+(?:sudah\s+)?(?:tidak|bukan)/i.test(baris)) continue
    catat('F66', rel, barisKe(src, m.index), 'menyebut Appwrite')
  }

  // F-67 — nama koleksi selalu persis seperti skema (PascalCase).
  for (const m of src.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)) {
    const nama = m[1]
    if (NAMES.includes(nama)) continue
    const padan = NAMES.find((n) => n.toLowerCase() === nama.toLowerCase())
    if (padan) catat('F67', rel, barisKe(src, m.index), `koleksi \`${nama}\` harus \`${padan}\``)
  }
  // Nama koleksi di luar backtick juga dihitung kalau persis salah satu alias.
  for (const m of src.matchAll(/\bkoleksi\s+(?:bernama\s+)?([a-z][a-z0-9_]*)\b/g)) {
    const padan = NAMES.find((n) => n.toLowerCase() === m[1])
    if (padan) catat('F67', rel, barisKe(src, m.index), `koleksi ${m[1]} harus ${padan}`)
  }

  // F-68 — klaim "`field` (Tipe)" harus sama dengan tipe di snapshot, dan daftar select
  // harus persis nilai server.
  for (const m of src.matchAll(/`([a-z_][a-z0-9_]*)`\s*\(([^)]{2,90})\)/g)) {
    const [, nama, klaim] = m
    const truths = fieldsByName.get(nama)
    if (!truths) continue
    const baris = barisKe(src, m.index)
    const selectList = /^select:\s*(.+)$/i.exec(klaim)
    if (selectList) {
      const nilai = selectList[1].split(/[,/]/).map((s) => s.trim()).filter(Boolean)
      const padan = truths.find((t) => t.values && t.values.length === nilai.length
        && t.values.every((v, i) => v === nilai[i]))
      const benar = truths.find((t) => t.values)
      if (!padan && benar) {
        const hilang = benar.values.filter((v) => !nilai.includes(v))
        const asing = nilai.filter((v) => !benar.values.includes(v))
        catat('F68', rel, baris, `select ${nama} ditulis [${nilai.join(', ')}], server [${benar.values.join(', ')}]`
          + (hilang.length ? ` — hilang: ${hilang.join(', ')}` : '') + (asing.length ? ` — asing: ${asing.join(', ')}` : ''))
      } else if (!padan && !benar) {
        catat('F68', rel, baris, `${nama} ditulis sebagai select padahal tipe server ${truths.map((t) => t.type).join('/')}`)
      }
      continue
    }
    const key = tipeYangDiklaim(klaim)
    if (!key) continue
    const cocok = truths.some((t) => t.type === key)
    if (!cocok) {
      catat('F68', rel, baris, `${nama} ditulis "(${klaim})" padahal tipe server ${truths.map((t) => t.type).join('/')}`)
    }
  }

  // F-68 — teks rule yang ditulis SEBELAH label rule ("API Rules: `…`" / "createRule = `…`")
  // harus persis sama dengan rule yang ada di skema. Sengaja judged hanya untuk garis berlabel,
  // supaya kiasan seperti "API Rules berbasis `@request.auth.id`" (AGENTS.md) tidak dianggap
  // klaim verbatim. Yang ditelan dokumen dulu justru bentuk label: `id = @request.auth.id`
  // adalah potongan, bukan rule yang benar-benar dipakai server.
  const barisDoc = src.split('\n')
  for (let i = 0; i < barisDoc.length; i++) {
    const baris = barisDoc[i]
    if (!/Rules?\s*[:=]/.test(baris)) continue
    for (const m of baris.matchAll(/`([^`]*@request\.[^`]*)`/g)) {
      // Dokumen bukti (TODO.md) mengutip baris migrasi utuh: `createRule = '…'`. Ambil
      // nilai di dalam kutipannya, kalau tidak klaim yang benar akan jadi merah.
      const teks = m[1].replace(/^[A-Za-z]*Rule\s*[:=]\s*/, '').trim().replace(/^['"]|['"]$/g, '').trim()
      if (!RULE_SET.has(teks)) {
        catat('F68', rel, i + 1, `rule "${teks}" tidak ada di snapshot (sumber tunggal sejak F-57); yang ada: ${RULE_TULIS.join(' | ')}`)
      }
    }
  }

  // F54 (kelas yang sama, bukan ID F-69 audit) — versi node di dokumen harus sama dengan
  // .nvmrc; selisih mayor membuat `npm run test:*` mati dengan `node: bad option`.
  if (/Node\.js/i.test(src)) {
    for (const m of src.matchAll(/Node\.js[^\n]{0,80}?(?:v|versi\s+)(\d+)(?:\.\d+|\.x|x)/g)) {
      if (Number(m[1]) !== NODE_MAJOR) {
        catat('F54', rel, barisKe(src, m.index), `menyarankan node v${m[1]}, .nvmrc mengunci ${NVM}`)
      }
    }
  }
}

// F-68 lanjutan: file contoh yang disebut dokumen agen harus benar-benar ada.
for (const rel of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md']) {
  let src
  try { src = read(rel) } catch { continue }
  for (const m of src.matchAll(/[`"]([\w.-]+\.example)[`"]/g)) {
    const ada = readdirSync(ROOT).includes(m[1])
    if (!ada) catat('F68', rel, barisKe(src, m.index), `merujuk ${m[1]} yang tidak ada di root repo`)
  }
}

const jumlah = Object.entries(TEMUAN).filter(([, v]) => v.length)
for (const [id, daftar] of jumlah) {
  for (const d of new Set(daftar)) console.log(`RED  ${id}  ${d}`)
}
const total = jumlah.reduce((a, [, v]) => a + v.length, 0)
const dinilai = tracked.filter((r) => !excluded(r))
console.log(`\nsumber kebenaran: ${snapshotFile} (${NAMES.join(', ')}), .nvmrc ${NVM}`)
console.log(`${tracked.length} berkas markdown ter-track, ${dinilai.length} dinilai, ${tracked.length - dinilai.length} dikecualikan dengan alasan`)
console.log(total ? `\n${total} klaim dokumen tidak cocok dengan skema/perkakas.` : 'Semua klaim dokumen cocok dengan skema dan perkakas.')
process.exit(total ? 1 : 0)
