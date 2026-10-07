// pb_hooks/ai_proxy.pb.js
//
// Proxy Gemini untuk klien mobile: kunci API tidak pernah keluar dari server, dan
// hanya pemakai yang login yang boleh memakainya ($apis.requireAuth()).
//
// Batas yang ditegakkan di sini (semuanya terukur oleh tools/test/ai-proxy.mjs):
//   - tipe payload divalidasi sebelum diteruskan (prompt wajib string)
//   - panjang prompt dibatasi supaya satu akun tidak bisa mengirim dokumen raksasa
//   - kegagalan upstream dibalas generik; pesan vendor (kode, status, isi `res.raw`)
//     hanya masuk ke log server
//   - rate limit per akun per menit
//
// API yang dipakai dipilih yang tersedia baik di PocketBase 0.26 maupun 0.40:
// `c.requestInfo().body` (bukan c.bind()/DynamicModel yang gagal di 0.40), `c.auth`
// (bukan c.authRecord), dan `c.json()` untuk status non-standar (BadRequestError hanya
// memberi 400).
//
// ⚠️ Dua perilaku JSVM PocketBase yang sudah menjebak dan jadi alasan bentuk kode di
// bawah ini (semuanya diukur 2026-10-07 di server 0.40.4):
//   1. Binding level-skrip TIDAK terlihat dari dalam closure handler — `const` di luar
//      `routerAdd(...)` maupun `function` yang didefinisikan sebelum/ sesudahnya
//      menghasilkan "ReferenceError: <nama> is not defined" saat request, dan
//      PocketBase membalas 400 generik tanpa jejak di stdout. Karena itu semua konstanta
//      dan helper hidup di dalam body handler.
//   2. `$app.store()` bukan `Save/Get/Delete` seperti di Go: yang ada `get(key)`,
//      `set(key, value)`, `has(key)`, `remove(key)`; TTL memakai default registrasi
//      "cache" = 60 detik, dan `set` dengan tiga argumen menyimpan argumen keduanya.
//      `$apis.requireRateLimit()` juga TIDAK ada di 0.40.4, jadi window-nya manual.

routerAdd("POST", "/api/ai/gemini", (c) => {
  const MAX_PROMPT_CHARS = 4000
  const RATE_LIMIT_REQUESTS = 10
  const RATE_LIMIT_KEY_PREFIX = 'ai:rate:'

  const logServerSide = (message, meta) => {
    // Bentuk argumen logger berbeda antar versi PocketBase; kegagalan log tidak boleh
    // menggagalkan respons ke klien.
    try {
      $app.logger.error(message, 'detail', String(meta).slice(0, 500))
    } catch (e) {
      // diabaikan dengan sengaja
    }
  }

  const apiKey = $os.getenv("GEMINI_API_KEY")
  if (!apiKey) {
    throw new BadRequestError("GEMINI_API_KEY is not configured on the server.")
  }

  const body = c.requestInfo().body || {}
  const prompt = body.prompt

  if (prompt === undefined || prompt === null || prompt === "") {
    throw new BadRequestError("Prompt is required.")
  }
  if (typeof prompt !== "string") {
    throw new BadRequestError("Prompt must be a string.")
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return c.json(413, { message: "Prompt terlalu panjang (maksimum " + MAX_PROMPT_CHARS + " karakter)." })
  }

  // Fixed-window counter; store bersama supaya tidak bergantung pada berapa JSVM
  // runtime yang dipakai, dan TTL 60 detik membuat jendela menutup sendiri.
  const store = $app.store()
  const rateKey = RATE_LIMIT_KEY_PREFIX + c.auth.id
  const seen = Number(store.get(rateKey) || 0) + 1
  store.set(rateKey, seen)
  if (seen > RATE_LIMIT_REQUESTS) {
    return c.json(429, { message: "Terlalu banyak permintaan AI. Tunggu sebentar lalu coba lagi." })
  }

  // Rolling alias on purpose: the pinned names this hook used before (gemini-2.0-flash,
  // gemini-2.5-flash) have both been retired upstream, and gemini-flash-latest was
  // returning RESOURCE_EXHAUSTED on 5/5 probes while gemini-flash-lite-latest was 5/5.
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent"

  const reqBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      topP: 1,
      topK: 1,
      maxOutputTokens: 1000,
    },
  })

  const res = $http.send({
    url: url,
    method: "POST",
    body: reqBody,
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    timeout: 120 // seconds
  })

  if (res.statusCode !== 200) {
    logServerSide("ai_proxy: upstream menolak", "status=" + res.statusCode + " raw=" + res.raw)
    return c.json(502, { message: "Layanan AI sedang tidak tersedia. Coba lagi beberapa saat." })
  }

  try {
    return c.json(200, JSON.parse(res.raw))
  } catch (e) {
    logServerSide("ai_proxy: respons upstream bukan JSON", res.raw)
    return c.json(502, { message: "Layanan AI memberi respons yang tidak dapat dibaca." })
  }
}, $apis.requireAuth())
