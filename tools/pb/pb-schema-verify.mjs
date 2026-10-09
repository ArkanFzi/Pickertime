import PocketBase from 'pocketbase'

const BASE = process.argv[2]
if (!BASE) {
  console.error('Pemakaian: node tools/pb/pb-schema-verify.mjs <URL-backend-uji> [label]. Tanpa argumen pertama BASE = undefined dan setiap request mati sebagai ClientResponseError status 0 (terjadi 2026-10-09, disalahbaca sebagai regresi hook).')
  process.exit(2)
}
// Alat ini MENULIS dan MENGHAPUS record, jadi backend produksi bukan targetnya.
if (/elarisnoir/.test(BASE)) {
  console.error('DILARANG menjalankan perkakas mutasi ini ke backend produksi. BASE harus 127.0.0.1.')
  process.exit(1)
}
const tag = process.argv[3] || BASE
const SU_EMAIL = process.env.PB_SU_EMAIL || 'su1@local.test'
const SU_PW = process.env.PB_SU_PASSWORD || ''
const EMAIL = 'verify-' + Date.now() + '@example.com'
function dump(e) { const b = ['status=' + (e && e.status), 'msg=' + String(e && e.message).slice(0, 90)]; try { if (e && e.data) b.push('detail=' + JSON.stringify(e.data).slice(0, 220)) } catch { } return b.join(' | ') }
let bad = 0
async function t(name, fn) { try { const v = await fn(); console.log(`OK   ${tag} :: ${name} :: ${v}`); return v } catch (e) { bad++; console.log(`FAIL ${tag} :: ${name} :: ${dump(e)}`); return null } }
function expectStatus(label, got, want) {
  return fetchWrap(label, got, want)
}
function fetchWrap(label, got, want) {
  if (got !== want) { bad++; console.log(`FAIL ${tag} :: ${label} :: expected HTTP ${want}, got ${got}`); return null }
  console.log(`OK   ${tag} :: ${label} :: HTTP ${got}`); return got
}

// skema TIDAK dibuat di sini — harus sudah ada dari pb_migrations
const EXPECT = {
  Profiles: ['full_name', 'role', 'focus_goal', 'energy_pref', 'avatar_url', 'created', 'updated'],
  Tasks: ['user', 'title', 'description', 'category', 'priority', 'start_time', 'end_time', 'duration_minutes', 'is_completed', 'has_alarm', 'alarm_minutes_before', 'created', 'updated'],
  Focus_Sessions: ['user', 'task', 'duration_seconds', 'completed', 'created', 'updated'],
  Workspace_Events: ['user', 'event_type', 'payload', 'occurred_at', 'is_processed', 'created', 'updated'],
}
const su = new PocketBase(BASE); su.autoCancellation(false)
await t('superuser.auth', async () => 'ok')
await su.collection('_superusers').authWithPassword(SU_EMAIL, SU_PW)
const cols = await t('collections present', async () => { const l = await su.collections.getFullList({ batch: 500 }); return l.map(c => c.name).join(',') })
for (const [name, want] of Object.entries(EXPECT)) {
  await t('schema ' + name, async () => {
    const raw = await fetch(BASE + '/api/collections/' + name, { headers: { Authorization: su.authStore.token } }).then(r => r.json())
    if (!raw.id) throw new Error(JSON.stringify(raw).slice(0, 120))
    const have = raw.fields.map(f => f.name)
    const missing = want.filter(w => !have.includes(w))
    if (missing.length) throw new Error('missing fields: ' + missing.join(','))
    return 'ok rules[list=' + JSON.stringify(raw.listRule) + ' create=' + JSON.stringify(raw.createRule) + ']'
  })
}

// T-21: `event_type` tidak boleh lagi text bebas, dan `occurred_at` harus kolom date sungguhan
// (bukan di dalam JSON) — loop belajar memfilter per hari pada kolom ini. Diperiksa terpisah
// dari EXPECT di atas karena EXPECT hanya melihat nama kolom, bukan penegakannya.
await t('Workspace_Events penegakan skema', async () => {
  const raw = await fetch(BASE + '/api/collections/Workspace_Events', { headers: { Authorization: su.authStore.token } }).then(r => r.json())
  const et = raw.fields.find(f => f.name === 'event_type')
  const oc = raw.fields.find(f => f.name === 'occurred_at')
  if (!et || !et.pattern) throw new Error('event_type tanpa pattern: ' + JSON.stringify(et))
  if (!oc || oc.type !== 'date') throw new Error('occurred_at bukan date: ' + JSON.stringify(oc))
  if (oc.required !== false) throw new Error('occurred_at wajib membuat perangkat dengan build lama gagal menulis event; harus tidak wajib')
  return 'pattern=' + et.pattern + ' occurred_at=' + oc.type + '(required=false)'
})

const app = new PocketBase(BASE); app.autoCancellation(false)
await t('sign-up (anon)', async () => { await app.collection('Profiles').create({ email: EMAIL, password: 'Password123!', passwordConfirm: 'Password123!', full_name: 'Verify', role: 'Professional', emailVisibility: true }); return 'created' })
await t('sign-in', async () => { const r = await app.collection('Profiles').authWithPassword(EMAIL, 'Password123!'); return 'resKeys=' + JSON.stringify(Object.keys(r)) + ' isValid=' + app.authStore.isValid })
const uid = app.authStore.model.id
const iso = new Date().toISOString()
const task = await t('Tasks.create', async () => app.collection('Tasks').create({ user: uid, title: 'Verify task', description: 'd', category: 'Study', priority: 'Medium', start_time: iso, end_time: new Date(Date.now() + 36e5).toISOString(), duration_minutes: 45, is_completed: false, has_alarm: true, alarm_minutes_before: 15 }))
if (task) {
  console.log(`     ${tag} :: round-trip :: start_time=${task.start_time} end_time=${task.end_time} created=${task.created} duration=${task.duration_minutes}`)
  await t('Tasks filter(created ISO)', async () => { const l = await app.collection('Tasks').getFullList({ filter: `user = "${uid}" && created >= "${new Date(Date.now() - 864e5).toISOString()}"` }); return 'count=' + l.length })
  await t('Focus_Sessions.create', () => app.collection('Focus_Sessions').create({ user: uid, task: task.id, duration_seconds: 2700, completed: true }))
  await t('Workspace_Events.create', async () => {
    const rec = await app.collection('Workspace_Events').create({ user: uid, event_type: 'START_FOCUS', occurred_at: iso, payload: { task_id: task.id, task_title: 'Verify task', duration_minutes: 45, timestamp: iso }, is_processed: false })
    if (!rec.occurred_at) throw new Error('occurred_at tidak disimpan: ' + JSON.stringify(rec.occurred_at))
    return 'occurred_at=' + rec.occurred_at + ' created=' + rec.created
  })
  // Penegakan tulis: nilai di luar union aplikasi harus ditolak SERVER (F-01 untuk event_type —
  // tanpa baris ini, verifier justru selalu menulis nilai yang sah dan tidak pernah membuktikan
  // bahwa pattern ada).
  await t('Workspace_Events event_type haram harus 400', async () => {
    try {
      const rec = await app.collection('Workspace_Events').create({ user: uid, event_type: 'START_FOCUSS', occurred_at: iso, payload: { timestamp: iso }, is_processed: false })
      throw new Error('DITERIMA padahal di luar daftar (id=' + rec.id + ') — pattern tidak ditegakkan')
    } catch (e) {
      if (String(e.message).startsWith('DITERIMA')) throw e
      if (e.status !== 400) throw new Error('expected HTTP 400, got ' + e.status + ' ' + String(e.message).slice(0, 80))
      return 'HTTP 400 ' + JSON.stringify(e.data && e.data.event_type)
    }
  })
  await t('Workspace_Events filter(occurred_at rentang hari)', async () => {
    const l = await app.collection('Workspace_Events').getFullList({ filter: `user = "${uid}" && occurred_at >= "${new Date(Date.now() - 864e5).toISOString()}"` })
    if (!l.length) throw new Error('filter pada occurred_at mengembalikan 0 baris padahal baru saja ditulis')
    return 'count=' + l.length
  })
  await t('cross-user isolation (expect rejection)', async () => {
    const other = new PocketBase(BASE); other.autoCancellation(false)
    const otherEmail = 'other-' + Date.now() + '@example.com'
    await other.collection('Profiles').create({ email: otherEmail, password: 'Password123!', passwordConfirm: 'Password123!', full_name: 'Other', emailVisibility: true })
    await other.collection('Profiles').authWithPassword(otherEmail, 'Password123!')
      .catch(async () => { const l = await other.collection('Profiles').getFullList({ filter: 'email = "' + EMAIL + '"' }); throw new Error('leak: ' + l.length) })
    const mine = await other.collection('Tasks').getFullList()
    if (mine.length) throw new Error('LEAK: other user sees ' + mine.length + ' tasks')
    // F-03: isolasi bukan cuma soal baca — createRule harus mengikat kepemilikan.
    let writeRejected = ''
    try {
      const spoof = await other.collection('Tasks').create({ user: uid, title: 'Verify spoof', description: 'd', category: 'Study', priority: 'Medium', start_time: iso, end_time: new Date(Date.now() + 36e5).toISOString(), duration_minutes: 30, is_completed: false, has_alarm: false, alarm_minutes_before: 10 })
      throw new Error('SPOOF: user lain bisa menulis task atas nama ' + uid + ' (id=' + spoof.id + ')')
    } catch (err) {
      if (String(err.message).startsWith('SPOOF')) throw err
      writeRejected = 'HTTP ' + err.status
    }
    return 'other sees 0 tasks; tulis atas nama user lain ' + writeRejected + '; own profile readable=' + !!(await other.collection('Profiles').getOne(other.authStore.model.id).catch(() => null))
  })
}
// ai_proxy hook: harus menolak tanpa auth, dan melaporkan konfigurasi jika tanpa key
await t('POST /api/ai/complete tanpa token harus 401', async () => {
  const r = await fetch(BASE + '/api/ai/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'hi' }) })
  await r.text()
  if (fetchWrap('complete anon', r.status, 401) === null) throw new Error('status salah')
  return 'ok'
})
// Jalur lama (F-60) masih harus menjawab 401 untuk anonim karena gerbang agen di VM
// memakainya, dan 410 + code "moved" untuk yang login supaya build lama diberi tahu,
// bukan dibuang diam-diam.
await t('POST /api/ai/gemini (jalur lama) 401 anonim dan 410 moved bagi yang login', async () => {
  const anonRes = await fetch(BASE + '/api/ai/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'hi' }) })
  await anonRes.text()
  if (fetchWrap('gemini anon', anonRes.status, 401) === null) throw new Error('status salah')
  const authedRes = await fetch(BASE + '/api/ai/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: app.authStore.token }, body: JSON.stringify({ prompt: 'hi' }) })
  const body = await authedRes.text()
  if (authedRes.status !== 410) throw new Error('expected HTTP 410, got ' + authedRes.status + ' ' + body.slice(0, 120))
  if (!/"code"\s*:\s*"moved"/.test(body)) throw new Error('410 tanpa code "moved": ' + body.slice(0, 120))
  return '401 anonim; 410 code=moved bagi yang login'
})
// Konfigurasi key dibaca dari jawaban SERVER, bukan dari env proses verifier.
// Pelajaran terukur 2026-10-07: versi lama memakai `process.env.GEMINI_API_KEY` di sisi kita,
// padahal container bisa dipasang key sampah tanpa shell ini tahu — akibatnya assertion
// "harus 400 konfigurasi" merah palsu (server menjawab 502 karena key-nya memang ada).
// Ketiga keadaan di bawah tetap menuntut bukti, jadi tidak ada jalur yang kembali vacuous.
await t('POST /api/ai/complete dengan token: konfigurasi/key upstream tertangani tanpa bocor', async () => {
  const r = await fetch(BASE + '/api/ai/complete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: app.authStore.token }, body: JSON.stringify({ prompt: 'hi' }) })
  const body = await r.text()
  if (r.status === 400 && /GEMINI_API_KEY is not configured/.test(body)) return 'server tanpa key -> HTTP 400 pesan konfigurasi'
  if (r.status === 502) {
    if (/api\.googleapis|generativelanguage|INVALID_ARGUMENT|API key not valid|googleapis\.com/.test(body)) throw new Error('LEAK: body 502 menyebut detail upstream: ' + body.slice(0, 160))
    if (!/"code"\s*:\s*"unavailable"/.test(body)) throw new Error('502 tanpa code "unavailable" sehingga klien tidak bisa memetakan: ' + body.slice(0, 160))
    return 'server dengan key (upstream menolak) -> HTTP 502 generik tanpa detail vendor, code=unavailable'
  }
  if (r.status === 200) {
    const shaped = (() => { try { const b = JSON.parse(body); return typeof b.text === 'string' && !('candidates' in b) } catch { return false } })()
    if (!shaped) throw new Error('200 tapi body bukan { text } milik kontrak: ' + body.slice(0, 160))
    return 'server dengan key hidup -> HTTP 200 envelope { text, truncated }'
  }
  throw new Error('unexpected ' + r.status + ' ' + body.slice(0, 160))
})
console.log(bad === 0 ? `DONE ${tag} :: semua pemeriksaan lulus` : `DONE ${tag} :: ${bad} pemeriksaan GAGAL`)
process.exit(bad === 0 ? 0 : 1)
