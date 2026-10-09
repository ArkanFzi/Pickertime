// F-58: backend uji yang mati dulu dilaporkan sebagai tumpukan error SDK pocketbase
// (terukur: rc=1, 43.614 byte keluaran, isi pertama "ClientResponseError 0"). Skrip yang
// butuh backend hidup harus bilang apa yang dijalankan, bukan melempar stack.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

function die(url, detail) {
  console.error(`Backend uji tidak siap di ${url} :: ${detail}`)
  console.error('Nyalakan dulu (satu baris kalau container sudah pernah dibuat):')
  console.error('  docker start pt-pb-test')
  console.error('Kalau container-nya belum ada, topologi uji yang tercatat di TODO.md 10.1:')
  console.error(`  docker run -d --name pt-pb-test -p 127.0.0.1:8099:8090 \\
    -e GEMINI_API_KEY=INVALID-KEY-PROBE-ONLY \\
    -v "$HOME/.local/share/pickertime-test/pb_data:/pb_data" \\
    -v "${ROOT}/pb_hooks:/pb_hooks" \\
    -v "${ROOT}/pb_migrations:/pb_migrations" \\
    ghcr.io/muchobien/pocketbase:0.40.4`)
  console.error('Key-nya sengaja sampah: tanpa itu semua probe proxy jadi hijau palsu (F-13/F-14).')
  process.exit(1)
}

export async function requireTestBackend(url) {
  let res
  try {
    res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(4000) })
  } catch (err) {
    die(url, err.message)
  }
  if (!res.ok) die(url, `/api/health balas HTTP ${res.status}`)
  return res
}
