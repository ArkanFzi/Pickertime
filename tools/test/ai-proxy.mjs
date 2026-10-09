// Bukti hidup untuk jalur proxy AI (pb_hooks/ai_proxy.pb.js). Selama backend uji tidak
// punya GEMINI_API_KEY, semua request berhenti di pemeriksaan konfigurasi key sehingga
// sisanya tidak pernah teruji. Jalankan dengan key SAMPAH agar request benar-benar
// diteruskan ke Google dan kita bisa lihat apa yang bocor ke klien.
//
// Bentuk body yang dinilai di sini adalah kontrak klien (lib/aiContract.ts membaca `code`
// dan `message`), bukan bentuk JSON vendor — itu alasan endpoint berganti nama ke
// /api/ai/complete (F-60) dan hanya `{ text, truncated }` yang boleh keluar (F-42).
const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8099'
if (/elarisnoir/.test(BASE)) {
  console.error('DILARANG menembak backend produksi.')
  process.exit(1)
}

const { requireTestBackend } = await import('./backend-guard.mjs')
await requireTestBackend(BASE)

const { default: PocketBase } = await import('pocketbase')

const COMPLETE = '/api/ai/complete'
const LEGACY = '/api/ai/gemini'

let red = 0
const line = (state, msg) => { if (state === 'RED') red++; console.log(`${state.padEnd(4)} ${msg}`) }

async function ask(path, body, opts = {}) {
  const t0 = Date.now()
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: opts.token } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  }).catch((e) => ({ status: 0, text: async () => String(e.message), headers: { get: () => null } }))
  const text = await res.text()
  return { status: res.status, text, ms: Date.now() - t0 }
}

const complete = (body, opts) => ask(COMPLETE, body, opts)

// Jendela rate limit per akun membuat probe berikutnya dibalas 429 sebelum sempat menilai
// isi respons, sehingga hasilnya tampak hijau padahal tidak ada request yang benar-benar
// keluar ke Google. Tiap probe yang harus sampai ke upstream pakai akun baru.
async function freshToken(tag) {
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const p = new PocketBase(BASE)
  p.autoCancellation(false)
  await p.collection('Profiles').create({
    email, password: 'Probe-local-1234', passwordConfirm: 'Probe-local-1234',
    full_name: 'Probe', emailVisibility: true,
  })
  await p.collection('Profiles').authWithPassword(email, 'Probe-local-1234')
  return p.authStore.token
}

const anon = await complete({ prompt: 'hai' })
line(anon.status === 401 ? 'GREEN' : 'RED', `anon tanpa token -> HTTP ${anon.status} (harusnya 401)`)

// Gerbang agen di VM (`tools/deploy/pickertime-pb-agent.sh`) menuntut 401 anonim pada
// jalur yang masih dipakai build lama; tanpa ini, pemindahan nama endpoint membuat deploy
// berikutnya dianggap gagal oleh agen yang terpasang.
const legacyAnon = await ask(LEGACY, { prompt: 'hai' })
line(legacyAnon.status === 401 ? 'GREEN' : 'RED',
  `anon /api/ai/gemini -> HTTP ${legacyAnon.status} (harus tetap 401 supaya gate agen tidak bail)`)

const legacyToken = await freshToken('ai-legacy')
const legacyAuthed = await ask(LEGACY, { prompt: 'hai' }, { token: legacyToken })
const legacyMoved = legacyAuthed.status === 410 && /"code"\s*:\s*"moved"/.test(legacyAuthed.text)
line(legacyMoved ? 'GREEN' : 'RED',
  `authed /api/ai/gemini -> HTTP ${legacyAuthed.status}: ${legacyMoved ? '410 dengan code "moved" (build lama diberi tahu, bukan diam-diam)' : 'harusnya 410 + code moved, body: ' + legacyAuthed.text.slice(0, 120)}`)

const authed = await complete({ prompt: 'hai' }, { token: await freshToken('ai-leak') })
const liveKey = authed.status === 200
console.log(`     dengan token + key ${liveKey ? 'NYATA -> upstream menjawab' : 'sampah -> upstream menolak'}: HTTP ${authed.status} dalam ${authed.ms}ms`)
console.log(`     body: ${authed.text.slice(0, 220).replace(/\s+/g, ' ')}`)

if (/is not configured/i.test(authed.text)) {
  console.log('\nBackend uji tanpa GEMINI_API_KEY: request tidak pernah sampai upstream, jadi batas panjang,')
  console.log('validasi tipe, dan kebocoran error tidak bisa dinilai (semuanya akan tampak hijau palsu).')
  console.log('Jalankan ulang dengan key SAMPAH:')
  console.log(`  docker run -d --name pt-pb-test -p 127.0.0.1:8099:8090 -e GEMINI_API_KEY=INVALID-KEY-PROBE-ONLY ... ${'ghcr.io/muchobien/pocketbase:0.40.4'}`)
  process.exit(2)
}

// Kontrak error harus membawa `code` yang bisa dibaca klien (F-45): tanpa ini user hanya
// diberi pesan, dan pemetaan "kena batas" vs "layanan mati" tidak bisa dibedakan.
const hasCode = (r, code) => new RegExp('"code"\\s*:\\s*"' + code + '"').test(r.text)
// "sampai ke upstream" = hook tidak memotong sendiri (502 = ditolak Google, 200 = dijawab).
const reached = (r) => r.status === 502 || r.status === 200 || /Failed to communicate with Gemini API/i.test(r.text)

// Dua keadaan backend tidak bisa dinilai dalam satu run: kebocoran pesan vendor menuntut
// upstream MENOLAK (key sampah), envelope { text, truncated } menuntut upstream MENJAWAB
// (key nyata). Yang tidak dinilai dicatat NOTE, tidak pernah dihitung hijau — kedua sisi
// diukur terpisah dan angkanya ditulis di TODO.md.
if (liveKey) {
  console.log('NOTE tidak dinilai: kebocoran pesan vendor + code "unavailable" (butuh backend uji dengan key sampah)')
} else {
  const leaksUpstream = /gemini|googleapis|API key|permission_denied|invalid_?api/i.test(authed.text)
  // Kalau request malah berhenti di 429/401, pemeriksaan kebocoran tidak pernah menilai
  // body error upstream — itu hijau kosong, jadi dinyatakan RED.
  if (authed.status !== 502) {
    line('RED', `probe kebocoran error tidak sampai ke upstream (HTTP ${authed.status}) — hasil "tidak menyebut detail vendor" tidak bisa dipercaya`)
  } else {
    line(leaksUpstream ? 'RED' : 'GREEN',
      leaksUpstream
        ? 'pesan error upstream ditelanjangi ke klien (bocorkan detail vendor/key)'
        : `error upstream (HTTP ${authed.status}) tidak menyebut detail vendor`)
    line(hasCode(authed, 'unavailable') ? 'GREEN' : 'RED',
      `HTTP 502 membawa code "unavailable" untuk klien: ${authed.text.slice(0, 120).replace(/\s+/g, ' ')}`)
  }
}

const big = 'A'.repeat(200000)
// Satu akun baru untuk tiga probe validasi (semuanya ditolak sebelum rate limiter),
// satu akun baru lagi untuk burst supaya jendelanya penuh dan angkanya berarti.
const probe = await freshToken('ai-validate')
const huge = await complete({ prompt: big }, { token: probe, timeoutMs: 60000 })
line(huge.status === 413 && hasCode(huge, 'too_long') ? 'GREEN' : 'RED',
  `prompt 200.000 karakter -> HTTP ${huge.status} dalam ${huge.ms}ms; ${huge.status === 413 ? 'ditahan sebelum upstream' + (hasCode(huge, 'too_long') ? ' dengan code "too_long"' : ' TANPA code yang dibaca klien') : (reached(huge) ? 'diteruskan ke upstream, tidak ada batas panjang di hook' : 'bukan 413 dan tidak tercatat sampai upstream')}`)

const weird = await complete({ prompt: { $where: '1=1' } }, { token: probe, timeoutMs: 60000 })
line(weird.status === 400 && !reached(weird) ? 'GREEN' : 'RED',
  `prompt bertipe objek -> HTTP ${weird.status}; ${reached(weird) ? 'diteruskan apa adanya ke body Gemini (tidak ada validasi tipe di hook)' : 'ditolak hook sebelum ke upstream'}`)

const missing = await complete({}, { token: probe, timeoutMs: 60000 })
line(missing.status === 400 && /prompt/i.test(missing.text) ? 'GREEN' : 'RED',
  `prompt hilang -> HTTP ${missing.status} ${missing.text.slice(0, 90).replace(/\s+/g, ' ')}`)

// `json` adalah satu-satunya knob tambahan yang dikirim klien; tipe yang tidak diperiksa
// akan diteruskan mentah ke generationConfig upstream.
const badJsonFlag = await complete({ prompt: 'hai', json: 'yes' }, { token: probe, timeoutMs: 60000 })
line(badJsonFlag.status === 400 && !reached(badJsonFlag) ? 'GREEN' : 'RED',
  `json bertipe string -> HTTP ${badJsonFlag.status}; ${reached(badJsonFlag) ? 'diteruskan ke upstream tanpa validasi tipe' : 'ditolak hook sebelum ke upstream'}`)

// Sampel keberhasilan hanya bisa dinilai kalau upstream benar-benar menjawab 200 (butuh
// key nyata). Dengan key sampah ini TIDAK dinyatakan hijau — cuma dicatat belum dinilai.
const sample = await complete({ prompt: 'Balas JSON {"insight":"satu kata"}', json: true }, { token: await freshToken('ai-envelope'), timeoutMs: 60000 })
if (sample.status === 200) {
  const shaped = (() => { try { const b = JSON.parse(sample.text); return typeof b.text === 'string' && !('candidates' in b) && !('promptFeedback' in b) && 'truncated' in b } catch { return false } })()
  line(shaped ? 'GREEN' : 'RED',
    `respons 200 = { text, truncated } tanpa bentuk vendor -> ${shaped ? 'ok' : 'BURUK: ' + sample.text.slice(0, 160)}`)
} else {
  console.log(`NOTE tidak dinilai: envelope 200 (upstream membalas HTTP ${sample.status}; perlu GEMINI_API_KEY nyata)`)
}

// (a) Sekuensial = aritmetika jendela. Sengaja satu-per-satu karena angkanya harus tepat:
//     request ke-11 dan ke-12 dari akun baru wajib ditahan.
const seqToken = await freshToken('ai-seq')
const seq = []
for (let i = 0; i < 12; i++) seq.push(await complete({ prompt: 'hai' }, { token: seqToken, timeoutMs: 60000 }))
const seqPassed = seq.filter((r) => r.status !== 429).length
const seqThrottled = seq.filter((r) => r.status === 429).length
line(seqPassed === 10 && seqThrottled === 2 ? 'GREEN' : 'RED',
  `12 request SEKUENSIAL dari 1 akun baru -> ${seqPassed} lolos, ${seqThrottled} ditahan (harus 10/2; kalau bukan, aritmetika jendela salah)`)

// (b) Paralel = jendela tidak bisa dilewati oleh konkurensi. Counter-nya read-modify-write
// dan JSVM 0.40.4 tidak punya primitif increment atomik (terukur 2026-10-09: probe
// `typeof store.incr/add/increment` = undefined, dan `$apis` hanya berisi requireGuestOnly,
// requireAuth, requireSuperuserAuth, requireSuperuserOrOwnerAuth, skipSuccessActivityLog,
// gzip, bodyLimit, recordAuthResponse, enrichRecord, enrichRecords — tidak ada rateLimit),
// jadi satu request lebih bisa lolos pada burst yang benar-benar serentak; itu tepi yang
// diketahui dan dicatat sebagai F-81. Yang tidak boleh adalah jendelanya tidak menutup
// sama sekali, atau ada request yang hilang tanpa jawaban.
const burstToken = await freshToken('ai-burst')
const t0 = Date.now()
const burst = await Promise.all(Array.from({ length: 12 }, () => complete({ prompt: 'hai' }, { token: burstToken, timeoutMs: 60000 })))
const throttled = burst.filter((r) => r.status === 429).length
const passed = burst.filter((r) => r.status !== 429).length
const rateCodeOk = burst.filter((r) => r.status === 429).every((r) => hasCode(r, 'rate_limited'))
line(throttled > 0 && passed + throttled === 12 && rateCodeOk ? 'GREEN' : 'RED',
  `12 request PARALEL dari 1 akun baru -> ${passed} lolos, ${throttled} ditahan HTTP 429 dengan code "rate_limited"=${rateCodeOk} dalam ${Date.now() - t0}ms (0 ditahan = tanpa rate limit; lolos+ditahan != 12 = ada request tanpa jawaban)`)

console.log(red ? `\n${red} masalah pada jalur proxy AI terkonfirmasi.` : '\nJalur proxy AI bersih.')
process.exit(red ? 1 : 0)
