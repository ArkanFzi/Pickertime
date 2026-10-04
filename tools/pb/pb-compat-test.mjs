import PocketBase from 'pocketbase'

const BASE = process.argv[2]
const EMAIL = process.argv[3]
const PW = process.argv[4]
const tag = process.argv[5] || BASE

function dump(e) {
  const bits = ['status=' + (e && e.status), 'message=' + String(e && e.message).slice(0, 80)]
  try { if (e && e.data) bits.push('detail=' + JSON.stringify(e.data).slice(0, 300)) } catch { }
  return bits.join(' | ')
}
async function t(name, fn) {
  try { const v = await fn(); console.log(`OK   ${tag} :: ${name} :: ${v}`); return v }
  catch (e) { console.log(`FAIL ${tag} :: ${name} :: ${dump(e)}`); return null }
}

const SYS = [
  { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
  { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
]
const R = {
  listRule: '@request.auth.id != "" && user = @request.auth.id',
  viewRule: '@request.auth.id != "" && user = @request.auth.id',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != "" && user = @request.auth.id',
  deleteRule: '@request.auth.id != "" && user = @request.auth.id',
}
const AUTH_R = {
  listRule: '@request.auth.id != "" && id = @request.auth.id',
  viewRule: '@request.auth.id != "" && id = @request.auth.id',
  createRule: "",                   // public sign-up (app calls Profiles.create before auth)
  updateRule: '@request.auth.id != "" && id = @request.auth.id',
  deleteRule: '@request.auth.id != "" && id = @request.auth.id',
}

const pb = new PocketBase(BASE)
pb.autoCancellation(false)
await t('superuser.auth', async () => 'ok ' + (await pb.collection('_superusers').authWithPassword(EMAIL, PW)).record.email)

// wipe app collections so the script is idempotent
for (let pass = 1; pass <= 4; pass++) {
  const live = (await pb.collections.getFullList({ batch: 500 })).filter(c => !c.name.startsWith('_'))
  if (!live.length) break
  for (const c of live) await t(`wipe pass${pass} delete(` + c.name + ')', async () => { await pb.collections.delete(c.name); return 'deleted' })
}

const profiles = await t('create Profiles', async () => {
  const c = await pb.collections.create({
    type: 'auth', name: 'Profiles', ...AUTH_R,
    fields: [
      { type: 'text', name: 'full_name', required: true, max: 255 },
      { type: 'select', name: 'role', maxSelect: 1, values: ['Student', 'Professional', 'Researcher', 'Creator', 'Freelancer'] },
      { type: 'text', name: 'focus_goal', max: 500 },
      { type: 'select', name: 'energy_pref', maxSelect: 1, values: ['Morning', 'Afternoon', 'Night Owl'] },
      { type: 'file', name: 'avatar_url', maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] },
      ...SYS,
    ],
  })
  return 'id=' + c.id + ' listRule=' + c.listRule
})
const pid = (profiles || '').match(/pbc_\d+/)?.[0]
if (!pid) { console.log('ABORT ' + tag + ' :: Profiles gagal, tidak lanjut'); process.exit(0) }

const rel = (name) => ({ type: 'relation', name, collectionId: pid, cascadeDelete: true, maxSelect: 1, displayFields: ['full_name'] })

const tasks = await t('create Tasks', async () => {
  const c = await pb.collections.create({
    type: 'base', name: 'Tasks', ...R,
    fields: [
      rel('user'),
      { type: 'text', name: 'title', required: true, max: 255 },
      { type: 'text', name: 'description', max: 2000 },
      { type: 'select', name: 'category', maxSelect: 1, values: ['Work', 'Study', 'Health', 'Personal', 'Other'] },
      { type: 'select', name: 'priority', maxSelect: 1, values: ['High', 'Medium', 'Low'] },
      { type: 'date', name: 'start_time' },
      { type: 'date', name: 'end_time' },
      { type: 'number', name: 'duration_minutes', min: 0, max: 1440 },
      { type: 'bool', name: 'is_completed' },
      { type: 'bool', name: 'has_alarm' },
      { type: 'number', name: 'alarm_minutes_before', min: 0, max: 1440 },
      ...SYS,
    ],
  })
  return 'id=' + c.id + ' fields=' + c.fields.length
})

await t('create Focus_Sessions', async () => {
  const tid = tasks.match(/pbc_\d+/)[0]
  const c = await pb.collections.create({
    type: 'base', name: 'Focus_Sessions', ...R,
    fields: [
      rel('user'),
      { type: 'relation', name: 'task', collectionId: tid, cascadeDelete: false, maxSelect: 1, displayFields: ['title'] },
      { type: 'number', name: 'duration_seconds', min: 0 },
      { type: 'bool', name: 'completed' },
      ...SYS,
    ],
  })
  return 'id=' + c.id + ' fields=' + c.fields.length
})

await t('create Workspace_Events', async () => {
  const c = await pb.collections.create({
    type: 'base', name: 'Workspace_Events', ...R,
    fields: [
      rel('user'),
      { type: 'text', name: 'event_type', required: true },
      { type: 'json', name: 'payload' },
      { type: 'bool', name: 'is_processed' },
      ...SYS,
    ],
  })
  return 'id=' + c.id + ' fields=' + c.fields.length
})

// ── exercise the exact app call surface ──────────────────────────────────────
const anon = new PocketBase(BASE); anon.autoCancellation(false)
await t('sign-up: Profiles.create (anon, public createRule)', () => anon.collection('Profiles').create({
  email: 'u1@example.com', password: 'Password123!', passwordConfirm: 'Password123!',
  full_name: 'U One', role: 'Student', emailVisibility: true }))

const app = new PocketBase(BASE); app.autoCancellation(false)
const auth = await t('sign-in: Profiles.authWithPassword', async () => {
  const r = await app.collection('Profiles').authWithPassword('u1@example.com', 'Password123!')
  return 'resKeys=' + JSON.stringify(Object.keys(r)) + ' authStore.model=' + (app.authStore.model ? 'set' : 'NULL') + ' isValid=' + app.authStore.isValid
})
if (auth) {
  await t('context-setup: Profiles.update', async () => { const r = await app.collection('Profiles').update(app.authStore.model.id, { role: 'Professional', focus_goal: 'ship', energy_pref: 'Morning' }); return 'focus_goal=' + r.focus_goal })
  await t('profile: Profiles.getOne', async () => { const r = await app.collection('Profiles').getOne(app.authStore.model.id); return 'full_name=' + r.full_name + ' role=' + r.role })
  const sentStart = new Date().toISOString()
  const task = await t('syncAddTask: Tasks.create', async () => { const r = await app.collection('Tasks').create({
    user: app.authStore.model.id, title: 'Deep work', category: 'Work', priority: 'High',
    start_time: sentStart, duration_minutes: 50, is_completed: false, has_alarm: true, alarm_minutes_before: 10 });
    console.log(`     ${tag} :: start_time round-trip :: sent=${sentStart} got=${r.start_time} duration_minutes=${r.duration_minutes} priority=${r.priority}`);
    return r })
  if (task) {
    await t('syncToggleTask: Tasks.update', async () => { const r = await app.collection('Tasks').update(task.id, { is_completed: true }); return 'is_completed=' + r.is_completed })
    await t('syncFetchTasks: getFullList(date-only filter)', async () => { const today = new Date().toISOString().split('T')[0]; const l = await app.collection('Tasks').getFullList({ filter: `user = "${app.authStore.model.id}" && start_time >= "${today}"`, sort: 'start_time' }); return 'count=' + l.length })
    await t('insights: getFullList(ISO filter + fields)', async () => { const l = await app.collection('Tasks').getFullList({ filter: `user = "${app.authStore.model.id}" && start_time >= "${new Date(Date.now() - 7 * 864e5).toISOString()}"`, fields: 'is_completed' }); return 'count=' + l.length })
    await t('syncSnoozeTask: Tasks.update(2 datetimes)', () => app.collection('Tasks').update(task.id, { start_time: new Date(Date.now() + 6e5).toISOString(), end_time: new Date(Date.now() + 36e5).toISOString() }))
    await t('focus: Focus_Sessions.create', () => app.collection('Focus_Sessions').create({ user: app.authStore.model.id, task: task.id, duration_seconds: 1500, completed: true }))
    await t('insights: Focus_Sessions.getFullList(created filter)', async () => { const l = await app.collection('Focus_Sessions').getFullList({ filter: `user = "${app.authStore.model.id}" && created >= "${new Date(Date.now() - 7 * 864e5).toISOString()}"` }); return 'count=' + l.length })
    await t('focus: Workspace_Events.create(json payload)', () => app.collection('Workspace_Events').create({ user: app.authStore.model.id, event_type: 'SESSION_COMPLETE', payload: { task_id: task.id, task_title: 'Deep work', duration_minutes: 50, timestamp: new Date().toISOString() }, is_processed: false }))
    await t('authRefresh', async () => 'tokenLen=' + String((await app.collection('Profiles').authRefresh()).token.length))
    await t('requestPasswordReset', async () => 'sent=' + (await app.collection('Profiles').requestPasswordReset('u1@example.com')))
    const iso = new Date(Date.now() - 7 * 864e5).toISOString()
    const uid = app.authStore.model.id
    const probes = [
      ['FS: ISO-Z on created', 'Focus_Sessions', `user = "${uid}" && created >= "${iso}"`],
      ['FS: space-noZ on created', 'Focus_Sessions', `user = "${uid}" && created >= "${iso.replace('T', ' ').replace('Z', '')}"`],
      ['FS: date-only on created', 'Focus_Sessions', `user = "${uid}" && created >= "${iso.split('T')[0]}"`],
      ['FS: created alone', 'Focus_Sessions', `created >= "${iso}"`],
      ['Tasks: ISO-Z on created (control)', 'Tasks', `user = "${uid}" && created >= "${iso}"`],
      ['FS: no filter (control)', 'Focus_Sessions', ''],
    ]
    for (const [label, coll, f] of probes) {
      await t(`filter ${label}`, async () => { const l = await app.collection(coll).getFullList(f ? { filter: f } : {}); return 'count=' + l.length })
    }
  }
  await t('sign-out: authStore.clear', async () => { app.authStore.clear(); return 'isValid=' + app.authStore.isValid })
}

// ── realtime (SSE) endpoint the polyfill targets ─────────────────────────────
await t('realtime: POST /api/realtime (challenge)', async () => {
  const res = await fetch(BASE + '/api/realtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 'probe' }) })
  return 'status=' + res.status
})
await t('health.check', async () => JSON.stringify(await app.health.check()))
console.log('DONE ' + tag)
