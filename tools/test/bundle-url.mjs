// Bukukan F-09/F-10: nilai PocketBase yang benar-benar dipakai runtime.
// EXPO_PUBLIC_* di-inline saat bundling (restart Metro cukup, tanpa rebuild). Strings
// fallback di lib/pocketbase.ts TETAP ada di bundle sebagai ekspresi `||` runtime, jadi
// grep nama host saja menghasilkan false alarm — yang harus dibaca adalah nilai env
// yang di-inline, lalu fallback mana yang hidup kalau nilai itu hilang.
const PORT = process.env.METRO_PORT || '8083'
const PROD = 'api.elarisnoir.my.id'
const BUNDLE = `http://127.0.0.1:${PORT}/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false`

let src
try {
  src = await (await fetch(BUNDLE, { signal: AbortSignal.timeout(180000) })).text()
} catch (err) {
  console.error(`Gagal ambil bundle dari Metro :${PORT} :: ${err.message}. Jalankan: npm run test:device:up`)
  process.exit(1)
}
if (src.startsWith('{"type":"UnableToResolveError"')) {
  console.error('Metro membalas error resolusi modul. Entry harus expo-router/entry.')
  process.exit(1)
}

const inlined = (name) =>
  (src.match(new RegExp(name + '"\\s*:\\s*{\\s*enumerable:\\s*true,\\s*value:\\s*"([^"]*)"')) || [])[1] ?? null

const legacy = inlined('EXPO_PUBLIC_POCKETBASE_URL')
const primary = inlined('EXPO_PUBLIC_PB_URL')
const effective = legacy || primary
const pbUrlExpr = (src.match(/var PB_URL\s*=\s*[^;]+;/) || [])[0] || '(ekspresi PB_URL tidak ditemukan)'

console.log(`bundle = ${(src.length / 1048576).toFixed(1)} MB`)
console.log(`EXPO_PUBLIC_POCKETBASE_URL (nama bakunya lebih dulu dicek) = ${legacy === null ? 'tidak di-inline' : JSON.stringify(legacy)}`)
console.log(`EXPO_PUBLIC_PB_URL = ${primary === null ? 'tidak di-inline' : JSON.stringify(primary)}`)
console.log(`effective = ${effective === null ? 'FALLBACK SOURCE' : JSON.stringify(effective)}`)
console.log(`src     = ${pbUrlExpr}`)

if (effective === null) {
  console.log(`\nGAGAL: tidak ada env ter-inline, runtime jatuh ke '${PROD}' (temuan F-09).`)
  console.log('Perbaikan: isi .env lalu restart Metro, atau hapus fallback senyap di lib/pocketbase.ts.')
  process.exit(1)
}
if (effective.includes(PROD)) {
  console.log('\nGAGAL: bundle menunjuk backend produksi — hasil uji akan menulis data nyata.')
  process.exit(1)
}
console.log('\nLULUS: perangkat bicara ke backend uji lokal (127.0.0.1:8090 lewat adb reverse).')
