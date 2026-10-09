// Bukti hidup untuk jalur proxy AI (pb_hooks/ai_proxy.pb.js). Selama backend uji tidak
// punya GEMINI_API_KEY, semua request berhenti di pemeriksaan konfigurasi key sehingga
// sisanya tidak pernah teruji. Jalankan dengan key SAMPAH agar request benar-benar
// diteruskan ke Google dan kita bisa lihat apa yang bocor ke klien.
const URL = process.env.PB_TEST_URL || 'http://127.0.0.1:8099'
if (/elarisnoir/.test(URL)) {
  console.error('DILARANG menembak backend produksi.')
  process.exit(1)
}

const { requireTestBackend } = await import('./backend-guard.mjs')
await requireTestBackend(URL)

const { default: PocketBase } = await import('pocketbase')

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

// Jendela rate limit per akun membuat probe berikutnya dibalas 429 sebelum sempat menilai
// isi respons, sehingga hasilnya tampak hijau padahal tidak ada request yang benar-benar
// keluar ke Google. Tiap probe yang harus sampai ke upstream pakai akun baru.
async function freshToken(tag) {
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const p = new PocketBase(URL)
  p.autoCancellation(false)
  await p.collection('Profiles').create({
    email, password: 'Probe-local-1234', passwordConfirm: 'Probe-local-1234',
    full_name: 'Probe', emailVisibility: true,
  })
  await p.collection('Profiles').authWithPassword(email, 'Probe-local-1234')
  return p.authStore.token
}

const anon = await ask({ prompt: 'hai' })
line(anon.status === 401 ? 'GREEN' : 'RED', `anon tanpa token -> HTTP ${anon.status} (harusnya 401)`)

const authed = await ask({ prompt: 'hai' }, { token: await freshToken('ai-leak') })
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
// Kalau request malah berhenti di 429/401, pemeriksaan kebocoran tidak pernah menilai
// body error upstream — itu hijau kosong, jadi dinyatakan RED.
const reached = (r) => r.status === 502 || r.status === 200 || /Failed to communicate with Gemini API/i.test(r.text)
if (!reached(authed)) {
  line('RED', `probe kebocoran error tidak sampai ke upstream (HTTP ${authed.status}) — hasil "tidak menyebut detail vendor" tidak bisa dipercaya`)
} else {
  line(leaksUpstream ? 'RED' : 'GREEN',
    leaksUpstream
      ? 'pesan error upstream ditelanjangi ke klien (bocorkan detail vendor/key)'
      : `error upstream (HTTP ${authed.status}) tidak menyebut detail vendor`)
}

const big = 'A'.repeat(200000)
// Satu akun baru untuk tiga probe validasi (semuanya ditolak sebelum rate limiter),
// satu akun baru lagi untuk burst supaya jendelanya penuh dan angkanya berarti.
const probe = await freshToken('ai-validate')
const huge = await ask({ prompt: big }, { token: probe, timeoutMs: 60000 })
line(huge.status === 413 ? 'GREEN' : 'RED',
  `prompt 200.000 karakter -> HTTP ${huge.status} dalam ${huge.ms}ms; ${huge.status === 413 ? 'ditahan sebelum upstream' : (reached(huge) ? 'diteruskan ke upstream, tidak ada batas panjang di hook' : 'bukan 413 dan tidak tercatat sampai upstream')}`)

const weird = await ask({ prompt: { $where: '1=1' } }, { token: probe, timeoutMs: 60000 })
line(weird.status === 400 && !reached(weird) ? 'GREEN' : 'RED',
  `prompt bertipe objek -> HTTP ${weird.status}; ${reached(weird) ? 'diteruskan apa adanya ke body Gemini (tidak ada validasi tipe di hook)' : 'ditolak hook sebelum ke upstream'}`)

const missing = await ask({}, { token: probe, timeoutMs: 60000 })
line(missing.status === 400 && /prompt/i.test(missing.text) ? 'GREEN' : 'RED',
  `prompt hilang -> HTTP ${missing.status} ${missing.text.slice(0, 90).replace(/\s+/g, ' ')}`)

const burstToken = await freshToken('ai-burst')
const t0 = Date.now()
const burst = await Promise.all(Array.from({ length: 12 }, () => ask({ prompt: 'hai' }, { token: burstToken, timeoutMs: 60000 })))
const throttled = burst.filter((r) => r.status === 429).length
const passed = burst.filter((r) => r.status !== 429).length
// Dua-duanya harus terbukti: ada yang ditahan (batasnya ada) DAN yang lolos tidak lebih
// dari batas per menit (jendelanya ditegakkan). Akun baru membuat angka ini berarti —
// akun lama yang jendelanya sudah penuh akan memberi "12 ditahan" tanpa menilai apa pun.
line(throttled > 0 && passed > 0 && passed <= 10 ? 'GREEN' : 'RED',
  `12 request paralel dari 1 akun baru -> ${passed} lolos, ${throttled} ditahan HTTP 429 dalam ${Date.now() - t0}ms (0 ditahan = tanpa rate limit, >10 lolos = jendela tidak ditegakkan)`)

console.log(red ? `\n${red} masalah pada jalur proxy AI terkonfirmasi.` : '\nJalur proxy AI bersih.')
process.exit(red ? 1 : 0)
