// Bukti hidup tiga temuan yang tidak butuh sentuhan jari, dijalankan ke backend uji.
// Sengaja exit 1 selama lubangnya masih ada, supaya nanti bisa langsung dipasang
// sebagai gate CI tanpa diubah isinya — yang berubah adalah kode produksinya.
import PocketBase from 'pocketbase'

// Fungsi tulis produksi dijalankan apa adanya — node >= 22.18 dibutuhkan untuk membaca
// file .ts langsung (type stripping), dan itu yang dikunci .nvmrc.
let createTaskBatch
try {
  ({ createTaskBatch } = await import('../../lib/taskContract.ts'))
} catch (err) {
  console.error(`Gagal memuat lib/taskContract.ts dengan node ${process.version}: ${err.message}`)
  process.exit(1)
}

const URL = process.env.PB_TEST_URL || 'http://127.0.0.1:8099'
if (/elarisnoir/.test(URL)) {
  console.error('DILARANG menjalankan bukti temuan ke backend produksi.')
  process.exit(1)
}

const PW = process.env.PT_SEED_PASSWORD || 'Seed-local-1234'
async function account(email, name) {
  const pb = new PocketBase(URL)
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

// Baris bukti dari pemeriksaan lain dibersihkan di akhir.
const bukti = spoofed ? [spoofed] : []
for (const t of bukti) {
  await A.pb.collection('Tasks').delete(t.id).catch(() => {})
}
console.log(`\nbaris bukti dibersihkan: ${bukti.length}`)
console.log(red ? `${red} temuan masih hidup di backend uji.` : 'semua temuan sudah tertutup.')
process.exit(red ? 1 : 0)
