// Bukti hidup untuk jalur proxy AI (pb_hooks/ai_proxy.pb.js). Selama backend uji tidak
// punya GEMINI_API_KEY, semua request berhenti di pemeriksaan konfigurasi key sehingga
// sisanya tidak pernah teruji. Jalankan dengan key SAMPAH agar request benar-benar
// diteruskan ke Google dan kita bisa lihat apa yang bocor ke klien.
const URL = process.env.PB_TEST_URL || 'http://127.0.0.1:8099'
const EMAIL = process.env.PT_SEED_EMAIL || 'seed@pickertime.test'
const PASSWORD = process.env.PT_SEED_PASSWORD || 'Seed-local-1234'
if (/elarisnoir/.test(URL)) {
  console.error('DILARANG menembak backend produksi.')
  process.exit(1)
}

const { default: PocketBase } = await import('pocketbase')
const pb = new PocketBase(URL)
pb.autoCancellation(false)
await pb.collection('Profiles').authWithPassword(EMAIL, PASSWORD)
const token = pb.authStore.token

let red = 0
const line = (state, msg) => { if (state === 'RED') red++; console.log(`${state.padEnd(4)} ${msg}`) }

async function ask(body, opts = {}) {
  const t0 = Date.now()
  const res = await fetch(URL + '/api/ai/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: opts.token } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  }).catch((e) => ({ status: 0, text: async () => String(e.message), headers: { get: () => null } }))
  const text = await res.text()
  return { status: res.status, text, ms: Date.now() - t0 }
}

const anon = await ask({ prompt: 'hai' })
line(anon.status === 401 ? 'GREEN' : 'RED', `anon tanpa token -> HTTP ${anon.status} (harusnya 401)`)

const authed = await ask({ prompt: 'hai' }, { token })
console.log(`     dengan token + key sampah -> HTTP ${authed.status} dalam ${authed.ms}ms`)
console.log(`     body: ${authed.text.slice(0, 220).replace(/\s+/g, ' ')}`)

if (/is not configured/i.test(authed.text)) {
  console.log('\nBackend uji tanpa GEMINI_API_KEY: request tidak pernah sampai upstream, jadi batas panjang,')
  console.log('validasi tipe, dan kebocoran error tidak bisa dinilai (semuanya akan tampak hijau palsu).')
  console.log('Jalankan ulang dengan key SAMPAH:')
  console.log(`  docker run -d --name pt-pb-test -p 127.0.0.1:8099:8090 -e GEMINI_API_KEY=INVALID-KEY-PROBE-ONLY ... ${'ghcr.io/muchobien/pocketbase:0.40.4'}`)
  process.exit(2)
}

const leaksUpstream = /gemini|googleapis|API key|permission_denied|invalid_?api/i.test(authed.text)
line(leaksUpstream ? 'RED' : 'GREEN',
  leaksUpstream
    ? 'pesan error upstream ditelanjangi ke klien (bocorkan detail vendor/key)'
    : 'error upstream tidak menyebut detail vendor')

const upstream = (r) => /Failed to communicate with Gemini API/.test(r.text)

const big = 'A'.repeat(200000)
const huge = await ask({ prompt: big }, { token, timeoutMs: 60000 })
line(huge.status !== 413 && upstream(huge) ? 'RED' : 'GREEN',
  `prompt 200.000 karakter -> HTTP ${huge.status} dalam ${huge.ms}ms; ${upstream(huge) ? 'dikirim utuh ke upstream, tidak ada batas panjang di hook' : 'ditahan sebelum upstream'}`)

const weird = await ask({ prompt: { $where: '1=1' } }, { token, timeoutMs: 60000 })
line(weird.status === 400 && !upstream(weird) ? 'GREEN' : 'RED',
  `prompt bertipe objek -> HTTP ${weird.status}; ${upstream(weird) ? 'diteruskan apa adanya ke body Gemini (tidak ada validasi tipe di hook)' : 'ditolak hook sebelum ke upstream'}`)

const missing = await ask({}, { token, timeoutMs: 60000 })
line(missing.status === 400 && /prompt/i.test(missing.text) ? 'GREEN' : 'RED',
  `prompt hilang -> HTTP ${missing.status} ${missing.text.slice(0, 90).replace(/\s+/g, ' ')}`)

const t0 = Date.now()
const burst = await Promise.all(Array.from({ length: 12 }, () => ask({ prompt: 'hai' }, { token, timeoutMs: 60000 })))
const throttled = burst.filter((r) => r.status === 429).length
line(throttled > 0 ? 'GREEN' : 'RED',
  `12 request paralel -> ${burst.filter((r) => r.status > 0).length} diteruskan, ${throttled} ditahan (0 = tidak ada rate limit) dalam ${Date.now() - t0}ms`)

console.log(red ? `\n${red} masalah pada jalur proxy AI terkonfirmasi.` : '\nJalur proxy AI bersih.')
process.exit(red ? 1 : 0)
