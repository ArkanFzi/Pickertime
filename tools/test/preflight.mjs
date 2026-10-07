// Pemeriksaan sebelum loop uji perangkat jalan. Gagal cepat lebih murah daripada
// alarm bunyi ke backend produksi.
import { execFileSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const ADB = process.env.PT_ADB || join(process.env.HOME || '', 'opt/platform-tools/adb')
const PB_TEST_URL = process.env.PB_TEST_URL || 'http://127.0.0.1:8099'
const METRO_PORT = Number(process.env.METRO_PORT || 8083)
const PROD_HOST = 'api.elarisnoir.my.id'

let failed = 0
function check(name, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
  if (!ok) failed++
}

const major = Number(process.versions.node.split('.')[0])
check('node >= 20', major >= 20, `aktif=${process.versions.node} (Node 18 memecah Metro di Array.prototype.toReversed)`)

let adbOut = ''
try {
  adbOut = execFileSync(ADB, ['devices', '-l'], { encoding: 'utf8' })
} catch (err) {
  check('adb tersedia', false, String(err.message).slice(0, 80))
}
if (adbOut) {
  const lines = adbOut.split('\n').slice(1).filter((l) => l.trim())
  const stateOf = (l) => (l.trim().split(/\s+/)[1] || '')
  const ready = lines.filter((l) => stateOf(l) === 'device')
  check('perangkat terautorisasi', ready.length > 0, lines.length ? lines[0].trim().slice(0, 90) : 'tidak ada perangkat; cek kabel & dialog USB debugging')
  if (ready.length && !lines.some((l) => /unauthorized|offline/.test(l))) {
    const model = execFileSync(ADB, ['shell', 'getprop', 'ro.product.model'], { encoding: 'utf8' }).trim()
    const sdk = execFileSync(ADB, ['shell', 'getprop', 'ro.build.version.sdk'], { encoding: 'utf8' }).trim()
    check('properti perangkat terbaca', true, `model=${model} androidApi=${sdk}`)
    const PKG = process.env.PT_PKG || 'my.id.elarisnoir.pickertime'
    const installed = execFileSync(ADB, ['shell', 'pm', 'list', 'packages', PKG], { encoding: 'utf8' }).includes(PKG)
    const freeMb = Math.round(Number(execFileSync(ADB, ['shell', 'df', '-k', '/data'], { encoding: 'utf8' })
      .trim().split('\n').pop().split(/\s+/)[3]) / 1024)
    check('dev client terpasang', installed,
      installed ? PKG : `${PKG} belum ada — ruang /data kini ${freeMb}MB; instal perlu ±1GB longgar (apk dev client 201MB)`)
  }
}

try {
  const res = await fetch(PB_TEST_URL + '/api/health', { signal: AbortSignal.timeout(3000) })
  check('backend uji sehat', res.status === 200, `${PB_TEST_URL} -> HTTP ${res.status}`)
} catch (err) {
  check('backend uji sehat', false, `${PB_TEST_URL} :: ${String(err.message).slice(0, 70)}`)
}

let deviceUrl = ''
try {
  const env = readFileSync(join(ROOT, '.env'), 'utf8')
  deviceUrl = (env.match(/^\s*EXPO_PUBLIC_PB_URL\s*=\s*(.+)$/m) || [])[1]?.trim() || ''
} catch {
  check('.env ada di root proyek', false, 'salin .env.example lalu arahkan ke 127.0.0.1:8090')
}
if (deviceUrl) {
  check('.env tidak menunjuk produksi', !deviceUrl.includes(PROD_HOST), `EXPO_PUBLIC_PB_URL=${deviceUrl}`)
  check('URL perangkat memakai port reverse 8090', /:8090\b/.test(deviceUrl), 'sisi ponsel harus 127.0.0.1:8090 agar "adb reverse tcp:8090" cukup')
}

const portFree = await new Promise((resolve) => {
  const sock = createConnection({ host: '127.0.0.1', port: METRO_PORT }, () => {
    sock.destroy()
    resolve(false)
  })
  sock.on('error', () => resolve(true))
  sock.setTimeout(700, () => { sock.destroy(); resolve(true) })
})
let metroLive = false
try {
  metroLive = (await fetch(`http://127.0.0.1:${METRO_PORT}/status`, { signal: AbortSignal.timeout(1200) })).ok
} catch {}
check(`port Metro ${METRO_PORT}`, portFree || metroLive,
  portFree ? 'bebas' : metroLive ? 'sudah ada Metro berjalan (dipakai ulang)' : 'dipakai proses lain — jangan pindah port tanpa mengubah adb reverse')

console.log(failed === 0 ? 'PREFLIGHT LULUS' : `PREFLIGHT GAGAL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
