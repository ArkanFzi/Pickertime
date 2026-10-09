import PocketBase from 'pocketbase'

const BASE = process.argv[2]
const SU_EMAIL = process.env.PB_SU_EMAIL
const SU_PW = process.env.PB_SU_PASSWORD
if (!BASE || !SU_EMAIL || !SU_PW) {
  console.error('usage: PB_SU_EMAIL=... PB_SU_PASSWORD=... node pb-prod-smoke.mjs <base-url>')
  process.exit(2)
}

const EMAIL = 'smoke-' + Date.now() + '@example.com'
const PW = 'SmokeTest123!'
let bad = 0
const created = []

const TRANSIENT = new Set([502, 503, 504, 520, 521, 522, 524])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 520/524 di jalur ini biasanya tunnel cloudflared yang ke-drop, bukan PocketBase:
// terukur 1 dari 75 request GET /api/collections/Tasks balas 520 sedangkan
// percobaan ulang langsung 200. Tanpa retry, gerbang deploy jadi merah acak
// dan memicu rollback yang tidak perlu.
async function t(name, fn, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const v = await fn()
      console.log(`OK   ${name} :: ${v}${i > 1 ? ' (percobaan ' + i + ')' : ''}`)
      return v
    } catch (e) {
      const st = e && e.status
      if (st && TRANSIENT.has(st) && i < tries) {
        console.log(`RETRY ${name} :: status=${st} percobaan ${i}/${tries}`)
        await sleep(i * 700)
        continue
      }
      bad++
      const data = e && e.data ? JSON.stringify(e.data).slice(0, 180) : ''
      console.log(`FAIL ${name} :: status=${st} msg=${String(e && e.message).slice(0, 90)} ${data}`)
      return null
    }
  }
  return null
}

const su = new PocketBase(BASE)
su.autoCancellation(false)
const app = new PocketBase(BASE)
app.autoCancellation(false)

await t('superuser auth', async () => {
  await su.collection('_superusers').authWithPassword(SU_EMAIL, SU_PW)
  return 'token len=' + su.authStore.token.length
})

const EXPECT = {
  Profiles: ['full_name', 'role', 'focus_goal', 'energy_pref', 'avatar_url', 'created', 'updated'],
  Tasks: ['user', 'title', 'description', 'category', 'priority', 'start_time', 'end_time', 'duration_minutes', 'is_completed', 'has_alarm', 'alarm_minutes_before', 'created', 'updated'],
  Focus_Sessions: ['user', 'task', 'duration_seconds', 'completed', 'created', 'updated'],
  Workspace_Events: ['user', 'event_type', 'payload', 'is_processed', 'created', 'updated'],
}

for (const [name, want] of Object.entries(EXPECT)) {
  await t('schema ' + name, async () => {
    const c = await su.collections.getOne(name)
    const have = c.fields.map((f) => f.name)
    const missing = want.filter((w) => !have.includes(w))
    if (missing.length) throw new Error('missing ' + missing.join(','))
    return 'fields=' + have.length
  })
}

await t('sign-up (anon)', async () => {
  const r = await app.collection('Profiles').create({
    email: EMAIL, password: PW, passwordConfirm: PW,
    full_name: 'Smoke', role: 'Professional', emailVisibility: true,
  })
  created.push(['Profiles', r.id])
  return 'id=' + r.id
})

let uid = null
await t('sign-in', async () => {
  const rec = await app.collection('Profiles').authWithPassword(EMAIL, PW)
  uid = rec.record.id
  return 'uid=' + uid + ' isValid=' + app.authStore.isValid
})

const iso = new Date().toISOString()
const task = await t('Tasks.create', async () => {
  const r = await app.collection('Tasks').create({
    user: uid, title: 'Smoke task', description: 'd', category: 'Study', priority: 'Medium',
    start_time: iso, end_time: new Date(Date.now() + 36e5).toISOString(),
    duration_minutes: 25, is_completed: false, has_alarm: true, alarm_minutes_before: 5,
  })
  created.push(['Tasks', r.id])
  return 'id=' + r.id
})

if (task) {
  await t('filter on created', async () => {
    const l = await app.collection('Tasks').getFullList({ filter: `user = "${uid}" && created >= "${new Date(Date.now() - 864e5).toISOString()}"` })
    return 'count=' + l.length
  })
  await t('Focus_Sessions.create', async () => {
    const r = await app.collection('Focus_Sessions').create({ user: uid, task: task.id, duration_seconds: 1500, completed: true })
    created.push(['Focus_Sessions', r.id])
    return 'id=' + r.id
  })
  await t('Workspace_Events.create', async () => {
    const r = await app.collection('Workspace_Events').create({ user: uid, event_type: 'START_FOCUS', payload: { task_id: task.id, timestamp: iso }, is_processed: false })
    created.push(['Workspace_Events', r.id])
    return 'id=' + r.id
  })
}

await t('anon Tasks.create must fail', async () => {
  const anon = new PocketBase(BASE)
  anon.autoCancellation(false)
  try {
    await anon.collection('Tasks').create({ user: uid, title: 'should not exist' })
    throw new Error('anon create was accepted')
  } catch (e) {
    if (e.message === 'anon create was accepted') throw e
    return 'rejected status=' + e.status
  }
})

await t('POST /api/ai/complete anon must be 401', async () => {
  const r = await fetch(BASE + '/api/ai/complete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'ping' }),
  })
  if (r.status !== 401) {
    const err = new Error('expected 401, got ' + r.status)
    err.status = r.status
    throw err
  }
  return 'HTTP 401'
})

// Jalur lama masih dipasang sebagai 410 (F-60) karena gerbang agen VM membacanya dan build
// lama masih memanggilnya; keduanya harus terbukti, bukan diam-diam.
await t('POST /api/ai/gemini (jalur lama) 401 anon + 410 moved when authed', async () => {
  const anonRes = await fetch(BASE + '/api/ai/gemini', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'ping' }),
  })
  await anonRes.text()
  if (anonRes.status !== 401) {
    const err = new Error('anon expected 401, got ' + anonRes.status)
    err.status = anonRes.status
    throw err
  }
  const r = await fetch(BASE + '/api/ai/gemini', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: app.authStore.token }, body: JSON.stringify({ prompt: 'ping' }),
  })
  const text = await r.text()
  if (r.status !== 410 || !/"code"\s*:\s*"moved"/.test(text)) {
    const err = new Error('authed expected 410 code=moved, got ' + r.status + ' ' + text.slice(0, 140))
    err.status = r.status
    throw err
  }
  return '401 anon; 410 code=moved'
})

await t('POST /api/ai/complete authed (real key, live Gemini)', async () => {
  const r = await fetch(BASE + '/api/ai/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: app.authStore.token },
    body: JSON.stringify({
      prompt: 'Reply with a JSON array of exactly 2 task objects: [ { "title": "short", "duration": 45 } ]',
      json: true,
    }),
  })
  const text = await r.text()
  if (r.status !== 200) {
    const err = new Error('HTTP ' + r.status + ' ' + text.slice(0, 200))
    err.status = r.status
    throw err
  }
  let json
  try { json = JSON.parse(text) } catch { throw new Error('non-JSON body: ' + text.slice(0, 160)) }
  // Kontrak klien adalah { text, truncated }; bentuk vendor tidak boleh keluar (F-42/F-60).
  if ('candidates' in json || 'promptFeedback' in json) throw new Error('body masih bentuk vendor: ' + text.slice(0, 160))
  if (typeof json.text !== 'string' || json.text === '') throw new Error('tanpa text: ' + text.slice(0, 160))
  if (json.truncated !== false) throw new Error('truncated bukan false: ' + JSON.stringify(json).slice(0, 160))
  // Ini bukti F-42a+F-42b ujung-ke-ujung: kalau hanya parts[0] yang diambil, atau model
  // tidak dipaksa menjawab JSON, array di bawah tidak akan ter-parse.
  const parsed = JSON.parse(json.text)
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('bukan array: ' + json.text.slice(0, 160))
  const judul = parsed.map((i) => String(i?.title ?? '?')).join(',')
  return 'chars=' + json.text.length + ' items=' + parsed.length + ' titles=' + judul.slice(0, 60)
})

console.log('--- cleanup ---')
for (const [col, id] of created.reverse()) {
  await t('delete ' + col + ' ' + id, async () => { await su.collection(col).delete(id); return 'deleted' })
}

const remaining = await t('rows left from this run', async () => {
  const l = await su.collection('Profiles').getFullList({ filter: `email = "${EMAIL}"` })
  if (l.length) throw new Error(l.length + ' profile rows remain')
  return '0'
})

console.log(bad === 0 ? 'SMOKE PASS' : 'SMOKE FAIL (' + bad + ')')
process.exit(bad === 0 ? 0 : 1)
