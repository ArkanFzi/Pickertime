// Bukti hidup temuan yang tidak butuh sentuhan jari, dijalankan ke backend uji.
// Sengaja exit 1 selama lubangnya masih ada, supaya nanti bisa langsung dipasang
// sebagai gate CI tanpa diubah isinya — yang berubah adalah kode produksinya.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import PocketBase from 'pocketbase'

// Fungsi tulis & aturan produksi dijalankan apa adanya — node >= 22.18 dibutuhkan untuk
// membaca file .ts langsung (type stripping), dan itu yang dikunci .nvmrc.
let createTaskBatch, resolveLeadMinutes, localDayStartEpoch, localWeekStart
try {
  ({ createTaskBatch, resolveLeadMinutes } = await import('../../lib/taskContract.ts'))
  ;({ localDayStartEpoch, localWeekStart } = await import('../../lib/localDay.ts'))
} catch (err) {
  console.error(`Gagal memuat lib/*.ts dengan node ${process.version}: ${err.message}`)
  process.exit(1)
}
for (const [nama, fn] of [
  ['resolveLeadMinutes', resolveLeadMinutes],
  ['localDayStartEpoch', localDayStartEpoch],
  ['localWeekStart', localWeekStart],
]) {
  if (typeof fn !== 'function') {
    console.error(`${nama} tidak terbaca sebagai function — gerbang ini tidak boleh diam-diam hijau.`)
    process.exit(1)
  }
}

// Perangkat memakai WIB (F-34). Zona waktu diset sebelum satu pun Date dibuat supaya
// seluruh skrip berjalan sebagai perangkat Jakarta, dan angka yang dilihat CI tidak
// bergantung pada zona waktu runner.
process.env.TZ = 'Asia/Jakarta'

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8099'
if (/elarisnoir/.test(BASE)) {
  console.error('DILARANG menjalankan bukti temuan ke backend produksi.')
  process.exit(1)
}

const { requireTestBackend } = await import('./backend-guard.mjs')
await requireTestBackend(BASE)

const PW = process.env.PT_SEED_PASSWORD || 'Seed-local-1234'
async function account(email, name) {
  const pb = new PocketBase(BASE)
  pb.autoCancellation(false)
  try {
    await pb.collection('Profiles').authWithPassword(email, PW)
    return { pb, id: pb.authStore.record.id }
  } catch {
    try {
      await pb.collection('Profiles').create({
        email, password: PW, passwordConfirm: PW, full_name: name,
        role: 'Professional', focus_goal: 'Deep work', energy_pref: 'Morning', emailVisibility: true,
      })
      await pb.collection('Profiles').authWithPassword(email, PW)
      return { pb, id: pb.authStore.record.id }
    } catch {
      // Akun sudah ada tapi dengan password lain -> tidak ada jalan lanjut yang jujur.
      console.error(`Gagal masuk sebagai ${email}. Jalankan dulu: npm run test:seed`)
      process.exit(1)
    }
  }
}

const A = await account('seed@pickertime.test', 'Seed User')
const B = await account('spoof-target@pickertime.test', 'Spoof Target')
const now = new Date()
const iso = (offsetMin) => new Date(now.getTime() + offsetMin * 60000).toISOString()
const taskPayload = (over = {}) => ({
  title: 'Bukti temuan', description: 'dibuat tools/test/findings.mjs', category: 'Study',
  priority: 'Medium', start_time: iso(60), end_time: iso(120), duration_minutes: 60,
  is_completed: false, has_alarm: false, alarm_minutes_before: 10, ...over,
})

let red = 0
const line = (state, id, msg) => { if (state === 'RED') red++; console.log(`${state.padEnd(4)} ${id.padEnd(6)} ${msg}`) }

// Sisa baris dari run yang mati di tengah jalan (sebelum blok bersih-bersih tercapai) akan
// membuat hitungan probe salah, jadi tiap judul probe dikosongkan lebih dulu.
const bersihkanSisa = async (title) => {
  const sisa = await A.pb.collection('Tasks').getFullList({ filter: `title = "${title}"` })
  for (const r of sisa) await A.pb.collection('Tasks').delete(r.id).catch(() => {})
  return sisa.length
}

// F-01 — kutub dibalik setelah sisi UI diperbaiki (commit 8c08aa8 + gate enum-contract).
// Yang masih harus benar adalah asumsinya: backend menolak nilai kategori di luar select.
try {
  await A.pb.collection('Tasks').create(taskPayload({ user: A.id, category: 'Creative' }))
  line('RED', 'F-01', 'category "Creative" DITERIMA server — kontrak select berubah, periksa migrasi dan gerbang enum')
} catch (err) {
  line('GREEN', 'F-01', `category "Creative" ditolak HTTP ${err.status} — kontrak select masih berlaku`)
}

// F-03 — createRule hanya memeriksa "ada auth", tidak memeriksa kepemilikan
let spoofed = null
try {
  spoofed = await A.pb.collection('Tasks').create(taskPayload({ user: B.id }))
  line('RED', 'F-03', `user A menulis task dengan user=<id B> -> tersimpan id=${spoofed.id} (rules tidak mengikat kepemilikan saat create; kalau migrasi 1790909800 sudah ada di repo tapi backend ini belum membacanya, restart container backend uji)`)
} catch (err) {
  line('GREEN', 'F-03', `penulisan atas nama user lain ditolak HTTP ${err.status}`)
}

// F-02 — jalankan fungsi tulis yang dipakai aplikasi (lib/taskContract.ts) dengan penulis
// PocketBase sungguhan: batch yang gagal tidak boleh menyisakan baris di database.
const batch = [91, 92, 93, 94].map((m) => taskPayload({ user: A.id, title: `Batch ${m}`, start_time: iso(m), end_time: iso(m + 30) }))
batch.push(taskPayload({ user: A.id, title: 'Batch rusak', category: 'Creative', start_time: iso(95), end_time: iso(125) }))
const countBatch = async () =>
  (await A.pb.collection('Tasks').getList(1, 1, { filter: `user = "${A.id}" && title ~ "Batch"` })).totalItems

const sebelum = await countBatch()
const writer = {
  create: (data) => A.pb.collection('Tasks').create(data),
  remove: (id) => A.pb.collection('Tasks').delete(id),
}
let batchError = null
try {
  await createTaskBatch(writer, batch)
} catch (err) {
  batchError = err
}
const sesudah = await countBatch()
const yatim = sesudah - sebelum
if (yatim !== 0) {
  line('RED', 'F-02', `${yatim} baris tertinggal walau batch gagal: ${batchError?.message ?? 'tanpa error'}`)
} else if (!batchError) {
  line('RED', 'F-02', 'batch berisi category "Creative" diterima tanpa error — validasi klien tidak berjalan')
} else {
  line('GREEN', 'F-02', `batch ditolak tanpa baris yatim — ${batchError.message}`)
}

// F-34 — "hari ini" dihitung UTC, padahal aplikasi dipakai pada WIB (UTC+7). Baris yang
// sama diuji dengan dua batas: tengah malam UTC (bentuk kode lama) dan tengah malam
// perangkat sebagai detik UTC (bentuk baru). Task 05:00 WIB tersimpan
// "2026-10-08 22:00:00.000Z", jadi pada 07:30 WIB batas lama buangnya dan batas baru
// tetap menemukannya.
const f34Title = 'F-34 batas hari WIB'
const jam0500 = new Date(2026, 9, 9, 5, 0, 0, 0)
const jam0730 = new Date(2026, 9, 9, 7, 30, 0, 0)
let f34row = null
try {
  const sisa34 = await bersihkanSisa(f34Title)
  f34row = await A.pb.collection('Tasks').create(taskPayload({
    user: A.id, title: f34Title,
    start_time: jam0500.toISOString(),
    end_time: new Date(jam0500.getTime() + 30 * 60000).toISOString(),
  }))
  const batasLama = `"${jam0730.toISOString().split('T')[0]}"`
  const batasBaru = String(localDayStartEpoch(jam0730))
  const cari = async (batas) => (await A.pb.collection('Tasks').getFullList({
    filter: `user = "${A.id}" && title = "${f34Title}" && start_time >= ${batas}`,
  })).length
  const [lama, baru] = [await cari(batasLama), await cari(batasBaru)]
  const storeSrc = readFileSync(new URL('../../store/useStore.ts', import.meta.url), 'utf8')
  if (baru !== 1) {
    line('RED', 'F-34', `batas hari lokal (${batasBaru}) TIDAK menemukan task 05:00 WIB (${f34row?.start_time}) — dapat=${baru}`)
  } else if (lama !== 0) {
    line('RED', 'F-34', `pembedanya tidak terbukti: batas UTC ${batasLama} juga menemukan baris (dapat=${lama}) — server tidak menafsirkan tanggal sebagai UTC, periksa asumsi`)
  } else if (!storeSrc.includes('localDayStartEpoch(') || storeSrc.includes(`toISOString().split('T')[0]`)) {
    line('RED', 'F-34', `perbaikan terbukti di query tapi store belum memakainya`)
  } else {
    line('GREEN', 'F-34', `05:00 WIB tersimpan "${f34row.start_time}"; batas UTC ${batasLama} -> ${lama} baris (bug lama), batas lokal ${batasBaru} -> ${baru} baris (sisa run lama dibersihkan: ${sisa34}), store memakai localDayStartEpoch`)
  }
} catch (err) {
  line('RED', 'F-34', `probe batas hari gagal: status=${err.status ?? '-'} ${String(err.message).slice(0, 120)}`)
}

// F-48 — `alarm_minutes_before || 10` mengubah 0 yang sah ("tepat waktu") menjadi 10 menit.
// Yang diuji fungsi produksi yang dipakai sisi jadwal DAN sisi tulis, plus pemanggilnya.
{
  const lead = [0, undefined, null, 1440].map((v) => resolveLeadMinutes(v))
  const notifSrc = readFileSync(new URL('../../lib/notifications.ts', import.meta.url), 'utf8')
  const salah = lead[0] !== 0 || lead[1] !== 10 || lead[2] !== 10 || lead[3] !== 1440
  if (salah) {
    line('RED', 'F-48', `resolveLeadMinutes(0|undefined|null|1440) -> ${lead.join(',')} , harapan 0,10,10,1440`)
  } else if (!notifSrc.includes('resolveLeadMinutes(') || /alarm_minutes_before\s*\|\|\s*10/.test(notifSrc)) {
    const masihAtauLimaBelas = /alarm_minutes_before\s*\|\|\s*10/.test(notifSrc)
    line('RED', 'F-48', `lib/notifications.ts belum memakai aturan ini — panggil resolveLeadMinutes=${notifSrc.includes('resolveLeadMinutes(')}, masih ada \`|| 10\`=${masihAtauLimaBelas}`)
  } else {
    line('GREEN', 'F-48', `lead 0 dipertahankan (0,undefined,null,1440 -> ${lead.join(',')}), notifications.ts memakai fungsi yang sama, tidak ada lagi || 10`)
  }
}

// F-79 — batas tanggal yang ditulis dengan huruf "T" (format ISO) dibandingkan PocketBase
// sebagai TEKS terhadap kolom "YYYY-MM-DD HH:MM:SS.mmmZ" (karena ' ' < 'T'), sehingga baris
// pada UTC-date yang sama hilang tanpa pesan. Diperiksa dua hal: jebakannya masih ada (guard
// tidak boleh pelan-pelan jadi hiasan) dan tidak ada satu pun filter `>= "<…toISOString()>"`
// yang tersisa di app/store/lib.
const AKAR = fileURLToPath(new URL('../../', import.meta.url))
const LEWATI = new Set(['node_modules', '.expo', '.git', 'android', 'ios', 'dist'])
const jejakISO = []
const jalan = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!LEWATI.has(e.name)) jalan(join(d, e.name))
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      const p = join(d, e.name)
      const isi = readFileSync(p, 'utf8')
      for (const m of isi.matchAll(/>=\s*"\$\{[^}]*toISOString\(\)/g)) {
        // Offset karakter tidak bisa ditunjuk; laporan memakai nomor baris.
        const baris = isi.slice(0, m.index).split('\n').length
        jejakISO.push(`${p.slice(AKAR.length)}:${baris}`)
      }
    }
  }
}
for (const dir of ['app', 'store', 'lib']) jalan(join(AKAR, dir))

const f79Title = 'F-79 batas ISO T'
let f79row = null
try {
  await bersihkanSisa(f79Title)
  f79row = await A.pb.collection('Tasks').create(taskPayload({
    user: A.id, title: f79Title,
    start_time: '2026-10-08T22:00:00.000Z',
    end_time: '2026-10-08T22:30:00.000Z',
  }))
  const jam = new Date(Date.UTC(2026, 9, 8, 17, 0, 0, 0))
  const isoT = `"${jam.toISOString()}"`
  const spasi = `"${jam.toISOString().replace('T', ' ')}"`
  const epoch = String(Math.floor(jam.getTime() / 1000))
  const cari75 = async (batas) => (await A.pb.collection('Tasks').getFullList({
    filter: `user = "${A.id}" && title = "${f79Title}" && start_time >= ${batas}`,
  })).length
  const [nIso, nSpasi, nEpoch] = [await cari75(isoT), await cari75(spasi), await cari75(epoch)]
  if (nSpasi !== 1 || nEpoch !== 1) {
    line('RED', 'F-79', `bentuk batas yang benar justru tidak menemukan baris "${f79row.start_time}" (spasi=${nSpasi}, epoch=${nEpoch})`)
  } else if (nIso !== 0) {
    line('RED', 'F-79', `jebakan ${isoT} tidak terbukti lagi (dapat=${nIso}) — penafsiran server berubah, guard ini harus dinilai ulang, bukan dihapus diam-diam`)
  } else if (jejakISO.length) {
    line('RED', 'F-79', `${jejakISO.length} filter masih membandingkan tanggal dengan literal ISO ber-"T": ${jejakISO.join(', ')}`)
  } else {
    line('GREEN', 'F-79', `baris "${f79row.start_time}": ${isoT} -> 0 baris, ${spasi} -> 1, epoch -> 1; ${jejakISO.length} filter ISO-"T" di app/store/lib`)
  }
} catch (err) {
  line('RED', 'F-79', `probe batas ISO gagal: status=${err.status ?? '-'} ${String(err.message).slice(0, 120)}`)
}

// F-80 — rumus awal minggu `now.getDate() - now.getDay() + 1` melompat ke Senin BERIKUTNYA
// pada hari Minggu (terukur: 13 dari 91 tanggal 1 Sep – 30 Nov 2026 berbeda, dan itu persis
// 13 dari 13 hari Minggu; 13 hari Sabtu cocok), dan label rentang minggu Insights memakainya.
// localWeekStart harus selalu mendarat di Senin, termasuk hari Minggu.
{
  const senin = new Date(2026, 9, 5).getTime()
  const meleset = []
  for (let i = 0; i < 7; i++) {
    const now = new Date(2026, 9, 5 + i, 10, 0, 0) // Senin 5 Okt s/d Minggu 11 Okt 2026
    const w = localWeekStart(now)
    if (w.getTime() !== senin) meleset.push(`${now.toDateString()} -> ${w.toDateString()}`)
  }
  const insightsSrc = readFileSync(new URL('../../app/(tabs)/insights.tsx', import.meta.url), 'utf8')
  const masihRumus = /now\.getDate\(\)\s*-\s*now\.getDay\(\)\s*\+\s*1/.test(insightsSrc)
  if (meleset.length) {
    line('RED', 'F-80', `localWeekStart meleset pada: ${meleset.join(', ')}`)
  } else if (masihRumus) {
    line('RED', 'F-80', 'app/(tabs)/insights.tsx masih menghitung awal minggu dengan rumus lama (melompat pada hari Minggu)')
  } else if (!insightsSrc.includes('localWeekStart(')) {
    line('RED', 'F-80', 'app/(tabs)/insights.tsx tidak memakai localWeekStart — gerbang ini kehilangan pegangan')
  } else {
    line('GREEN', 'F-80', `Senin..Minggu (5–11 Okt 2026) semuanya mendarat di ${new Date(senin).toDateString()}; insights.tsx memakai localWeekStart`)
  }
}

// Baris bukti dari pemeriksaan lain dibersihkan di akhir.
const bukti = [f34row, f79row, spoofed].filter(Boolean)
for (const t of bukti) {
  await A.pb.collection('Tasks').delete(t.id).catch(() => {})
}
console.log(`\nbaris bukti dibersihkan: ${bukti.length}`)
console.log(red ? `${red} temuan masih hidup di backend uji.` : 'semua temuan sudah tertutup.')
process.exit(red ? 1 : 0)
