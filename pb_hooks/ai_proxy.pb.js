// pb_hooks/ai_proxy.pb.js
//
// Proxy completion untuk klien mobile: kunci API tidak pernah keluar dari server, dan
// hanya pemakai yang login yang boleh memakainya ($apis.requireAuth()).
//
// Bentuk responsnya SENGAJA tidak meneruskan JSON vendor. Klien menerima
// `{ text, truncated }` saja, jadi mengganti provider (F-69) cukup mengubah bagian
// "upstream" di bawah tanpa menyentuh satu baris pun di app. Semua `parts` digabung
// (F-42a) karena Gemini memecah JSON ke beberapa part dan klien yang hanya membaca
// parts[0] mendapat potongan yang gagal parse tanpa suara.
//
// Batas yang ditegakkan di sini (semuanya terukur oleh tools/test/ai-proxy.mjs):
//   - tipe payload divalidasi sebelum diteruskan (prompt wajib string, json wajib boolean)
//   - panjang prompt dibatasi supaya satu akun tidak bisa mengirim dokumen raksasa
//   - kegagalan upstream dibalas generik; pesan vendor (kode, status, isi `res.raw`)
//     hanya masuk ke log server
//   - rate limit per akun per menit
//   - respons error selalu membawa `code` machine-readable supaya klien bisa membedakan
//     "kena batas" dari "layanan mati" (F-45)
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

routerAdd("POST", "/api/ai/complete", (c) => {
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

  const replyError = (status, code, message) => c.json(status, { code, message })

  const apiKey = $os.getenv("GEMINI_API_KEY")
  if (!apiKey) {
    throw new BadRequestError("GEMINI_API_KEY is not configured on the server.")
  }

  const body = c.requestInfo().body || {}
  const prompt = body.prompt
  const wantJson = body.json === undefined ? false : body.json

  if (prompt === undefined || prompt === null || prompt === "") {
    throw new BadRequestError("Prompt is required.")
  }
  if (typeof prompt !== "string") {
    throw new BadRequestError("Prompt must be a string.")
  }
  if (typeof wantJson !== "boolean") {
    throw new BadRequestError("The json flag must be a boolean.")
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return replyError(413, "too_long", "Prompt terlalu panjang (maksimum " + MAX_PROMPT_CHARS + " karakter).")
  }

  // Fixed-window counter; store bersama supaya tidak bergantung pada berapa JSVM
  // runtime yang dipakai, dan TTL 60 detik membuat jendela menutup sendiri.
  const store = $app.store()
  const rateKey = RATE_LIMIT_KEY_PREFIX + c.auth.id
  const seen = Number(store.get(rateKey) || 0) + 1
  store.set(rateKey, seen)
  if (seen > RATE_LIMIT_REQUESTS) {
    return replyError(429, "rate_limited", "Terlalu banyak permintaan AI. Tunggu sebentar lalu coba lagi.")
  }

  // F-69/K-5: nama model DIKUNCI, alias `-latest` dilepas. Isinya diukur hari ini dengan key
  // produksi di VM (generateContent, membaca `modelVersion` respons, prompt sama):
  //   gemini-flash-lite-latest -> modelVersion gemini-3.5-flash-lite, 597 ms, 48 token
  //   gemini-3.5-flash-lite    -> modelVersion gemini-3.5-flash-lite, 589 ms, 48 token, output sama
  //   gemini-3.1-flash-lite    -> modelVersion gemini-3.1-flash-lite, 689 ms, 42 token
  // Jadi pin ke nama ini = nol perubahan perilaku sekarang, dan menutup jalan berpindah diam-diam.
  // Alias dulu dipakai karena nama terkunci sebelumnya (gemini-2.0-flash, gemini-2.5-flash)
  // dipensiunkan upstream — itu alasan memasang pagar di CI (gerbang F-69 di findings.mjs),
  // bukan alasan memakai alias. `GET /v1beta/models/<alias>` tidak membuka isinya: field
  // `version` hanya label "Gemini Flash-Lite Latest" dan tidak ada field retirement sama sekali.
  const MODEL = "gemini-3.5-flash-lite"
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent"

  // topK dulu 1 = greedy decoding, yang membuat temperature dan topP tidak berpengaruh
  // sama sekali (F-44). Sekarang 32 supaya knob sampling di atasnya benar-benar hidup;
  // topP dihapus karena nilainya 1 = tidak mengaktifkan apa pun.
  const generationConfig = {
    temperature: 0.7,
    topK: 32,
    maxOutputTokens: 1000,
  }
  if (wantJson) {
    generationConfig.responseMimeType = "application/json"
  }

  const reqBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
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
    return replyError(502, "unavailable", "Layanan AI sedang tidak tersedia. Coba lagi beberapa saat.")
  }

  let data
  try {
    data = JSON.parse(res.raw)
  } catch (e) {
    logServerSide("ai_proxy: respons upstream bukan JSON", res.raw)
    return replyError(502, "unavailable", "Layanan AI memberi respons yang tidak dapat dibaca.")
  }

  const feedback = data.promptFeedback || {}
  if (feedback.blockType || feedback.blockReason) {
    // Isi blokir hanya masuk ke log server; klien diberi tahu bahwa ini bisa diulang.
    logServerSide("ai_proxy: prompt diblokir upstream", JSON.stringify(feedback))
    return replyError(400, "blocked", "Layanan AI menolak permintaan ini. Coba dengan kalimat lain.")
  }

  const candidate = (data.candidates || [])[0] || {}
  const parts = (candidate.content || {}).parts || []
  // Semua part digabung, bukan parts[0] saja (F-42a). Part tanpa `text` (mis. hanya
  // metadata) diabaikan.
  const text = parts
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text)
    .join("")

  const finishReason = candidate.finishReason || ""
  const truncated = finishReason === "MAX_TOKENS"
  if (truncated || text === "") {
    logServerSide(
      "ai_proxy: hasil upstream tidak lengkap",
      "finishReason=" + finishReason + " parts=" + parts.length + " chars=" + text.length
    )
  }

  return c.json(200, { text, truncated })
}, $apis.requireAuth())

// Jalur lama, DIPERTAHANKAN SEMENTARA dengan jawaban 410 (F-60). Dua pemakai nyata masih
// memanggilnya: agen di VM (`tools/deploy/pickertime-pb-agent.sh` punya gate "anon harus
// 401" pada path ini — kalau pathnya hilang, deploy berikutnya dianggap gagal dan di-
// rollback sebelum app sempat dipasang ulang) dan build app yang belum di-rebuild.
// $apis.requireAuth() tetap dipasang, jadi anonim tetap 401 seperti yang diharapkan gate.
// Hapus setelah `install-pb-agent.sh` dijalankan ulang di VM dan build app memakai
// /api/ai/complete.
routerAdd("POST", "/api/ai/gemini", (c) => {
  return c.json(410, {
    code: "moved",
    message: "Endpoint AI pindah ke /api/ai/complete. Perbarui aplikasi.",
  })
}, $apis.requireAuth())
