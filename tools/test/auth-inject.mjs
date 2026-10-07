#!/usr/bin/env node
// Menyuntik sesi login ke AsyncStorage dev build lewat `adb shell run-as`,
// karena MIUI V12 menolak INJECT_EVENTS sehingga form login tidak bisa diketik.
// Hanya menyentuh dev build + PocketBase lokal; ditolak kalau URL produksi.
// Butuh node >= 22.5 untuk `node:sqlite` — node 18 menolak flag-nya dengan
// "node: bad option: --experimental-sqlite" sebelum skrip ini sempat bicara.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const ADB = process.env.PT_ADB || join(process.env.HOME || '', 'opt/platform-tools/adb')
const PKG = process.env.PT_PKG || 'my.id.elarisnoir.pickertime'
const TMP = 'tools/test/tmp'
const LOCAL_DB = join(TMP, 'RKStorage.host')

const die = (msg, hint) => {
  console.error(`GAGAL: ${msg}`)
  if (hint) console.error(`  ${hint}`)
  process.exit(1)
}

const adb = (args, opts = {}) =>
  execFileSync(ADB, args, { encoding: 'utf8', ...opts }).trim()

const seed = JSON.parse(readFileSync(join(TMP, 'seed.json'), 'utf8'))
if (/elarisnoir/.test(seed.url)) die(`seed.json menunjuk produksi (${seed.url})`, 'Jalankan npm run test:seed terhadap PocketBase lokal dulu.')

if (!existsSync(ADB)) die('adb tidak ditemukan', 'Set PT_ADB.')
adb(['shell', 'run-as', PKG, 'true']) // gagal kalau build terpasang bukan dev build debuggable

// 1. Autentikasi lewat REST, lalu ambil token + record persis seperti
//    AsyncAuthStore.save() serialisasi: { token, record }.
const auth = await fetch(`${seed.url}/api/collections/Profiles/auth-with-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identity: seed.email, password: seed.password }),
})
if (!auth.ok) die(`auth-with-password ${auth.status}`, 'Jalankan dulu: npm run test:seed')
const { token, record } = await auth.json()
const payload = JSON.stringify({ token, record })
console.log(`auth OK: uid=${record.id} token.len=${token.length} expiry=${record.expires}`)

// 2. Tutup app supaya SQLite tidak sedang terbuka, lalu backup file aslinya.
adb(['shell', 'am', 'force-stop', PKG])
for (const suffix of ['-wal', '-shm', '-journal']) {
  spawnSync(ADB, ['shell', 'run-as', PKG, 'rm', `-f databases/RKStorage${suffix}`])
}
const backupPath = join(TMP, `RKStorage.backup-${Date.now()}`)
writeFileSync(backupPath, execFileSync(ADB, ['exec-out', 'run-as', PKG, 'cat', 'databases/RKStorage'], { maxBuffer: 1 << 24 }))
console.log(`backup asli: ${backupPath} (${readFileSync(backupPath).length} byte)`)

// 3. Tulis baris pb_auth di salinan host, kirim balik ke data dir app.
writeFileSync(LOCAL_DB, execFileSync(ADB, ['exec-out', 'run-as', PKG, 'cat', 'databases/RKStorage'], { maxBuffer: 1 << 24 }))
const db = new DatabaseSync(LOCAL_DB)
db.prepare('INSERT OR REPLACE INTO catalystLocalStorage (key, value) VALUES (?, ?)').run('pb_auth', payload)
db.close()

const put = spawnSync(ADB, ['shell', `run-as ${PKG} sh -c 'cat > databases/RKStorage'`], { input: readFileSync(LOCAL_DB) })
if (put.status !== 0) die('gagal menulis balik RKStorage', put.stderr.toString().trim())

const back = adb(['shell', `run-as ${PKG} sh -c 'grep -c pb_auth databases/RKStorage || true'`])
console.log(`baris pb_auth terbaca kembali di perangkat (grep -c = ${back})`)

// 4. Cold start lewat deep link dev launcher agar bundle di-load dari Metro.
adb(['reverse', 'tcp:8083', 'tcp:8083'])
adb(['reverse', 'tcp:8090', 'tcp:8099'])
adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
  '-d', 'exp+pickertime://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8083'])
console.log('dev client dimulai ulang dengan sesi tersuntik')
rmSync(LOCAL_DB)
