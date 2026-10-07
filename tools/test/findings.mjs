// Bukti hidup tiga temuan yang tidak butuh sentuhan jari, dijalankan ke backend uji.
// Sengaja exit 1 selama lubangnya masih ada, supaya nanti bisa langsung dipasang
// sebagai gate CI tanpa diubah isinya — yang berubah adalah kode produksinya.
import PocketBase from 'pocketbase'

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

// F-01 — nilai kategori UI ditolak select PocketBase
try {
  await A.pb.collection('Tasks').create(taskPayload({ user: A.id, category: 'Creative' }))
  line('GREEN', 'F-01', 'category "Creative" diterima — asumsi lama salah, cek migrasi terbaru')
} catch (err) {
  line('RED', 'F-01', `category "Creative" ditolak HTTP ${err.status} — UI tetap menampilkannya di 3 layar + prompt AI`)
}

// F-03 — createRule hanya memeriksa "ada auth", tidak memeriksa kepemilikan
let spoofed = null
try {
  spoofed = await A.pb.collection('Tasks').create(taskPayload({ user: B.id }))
  line('RED', 'F-03', `user A menulis task dengan user=<id B> -> tersimpan id=${spoofed.id} (rules tidak mengikat kepemilikan saat create)`)
} catch (err) {
  line('GREEN', 'F-03', `penulisan atas nama user lain ditolak HTTP ${err.status}`)
}

// F-02 — syncAddMultipleTasks jalan sekuensial: yang sah tertulis sebelum yang gagal
const batch = [91, 92, 93, 94].map((m) => taskPayload({ user: A.id, title: `Batch ${m}`, start_time: iso(m), end_time: iso(m + 30) }))
batch.push(taskPayload({ user: A.id, title: 'Batch rusak', category: 'Creative', start_time: iso(95), end_time: iso(125) }))
const written = []
let firstError = null
for (const p of batch) {
  try {
    written.push(await A.pb.collection('Tasks').create(p))
  } catch (err) {
    firstError = err
    break
  }
}
if (firstError && written.length) {
  line('RED', 'F-02', `${written.length} task tertulis lalu HTTP ${firstError.status} — baris yatim; caller hanya console.error`)
} else if (!firstError) {
  line('GREEN', 'F-02', 'tidak ada kegagalan di tengah batch')
}

for (const t of [...written, ...(spoofed ? [spoofed] : [])]) {
  await A.pb.collection('Tasks').delete(t.id).catch(() => {})
}
console.log(`\nbaris bukti dibersihkan: ${written.length + (spoofed ? 1 : 0)}`)
console.log(red ? `${red} temuan masih hidup di backend uji.` : 'semua temuan sudah tertutup.')
process.exit(red ? 1 : 0)
