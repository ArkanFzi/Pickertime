// Kontrak murni jalur AI: bentuk respons proxy, satu parser JSON bersama, batas panjang
// output dan pembungkus data user di dalam prompt. Sengaja tidak mengimpor PocketBase,
// AsyncStorage atau env supaya tools/test/findings.mjs bisa memakainya langsung di node
// tanpa backend dan tanpa jaringan (pola yang sama dengan lib/taskContract.ts).
//
// Nomor temuan yang ditegakkan file ini (docs/04_audit/action_plan_2026-10-08.md):
//   F-42b dua parser berbeda -> satu parseAiJson dipakai keempat fungsi
//   F-45  status + pesan server dibuang -> describeAiError menyimpan keduanya
//   F-47  output tak dibatasi, data user mentah -> capText + wrapData

export type AiFailureKind =
  | 'rate_limited'
  | 'too_long'
  | 'blocked'
  | 'unavailable'
  | 'not_configured'
  | 'bad_output'
  | 'moved'
  | 'unknown';

export type AiFailure = {
  kind: AiFailureKind;
  /** Bahasa untuk user; selalu ada, diambil dari pesan server bila server memberi. */
  message: string;
  retryable: boolean;
};

export type AiResult<T> = { value: T | null; failure: AiFailure | null };

export type AiCallOutcome = { ok: true; text: string } | { ok: false; failure: AiFailure };

// Batas output (F-47). Dulu hanya input yang dibatasi 4000 karakter di hook; teks hasil AI
// langsung dipakai sebagai judul/task nyata tanpa batas sama sekali.
export const AI_TITLE_MAX = 80;
export const AI_DESC_MAX = 280;
export const AI_STEP_MAX = 160;
export const AI_INSIGHT_MAX = 320;
export const AI_CATEGORY_MAX = 32;

const KIND_FALLBACK: Record<AiFailureKind, string> = {
  rate_limited: 'Terlalu banyak permintaan AI. Tunggu sebentar lalu coba lagi.',
  too_long: 'Permintaan AI terlalu panjang untuk diproses.',
  blocked: 'Layanan AI menolak permintaan ini.',
  unavailable: 'Layanan AI sedang tidak tersedia. Coba lagi beberapa saat.',
  not_configured: 'Layanan AI belum dikonfigurasi di server.',
  bad_output: 'Layanan AI mengirim jawaban yang tidak bisa dibaca.',
  moved: 'Endpoint AI yang dipakai build ini sudah dipensiunkan di server.',
  unknown: 'Layanan AI gagal menjawab.',
};

/**
 * Copy kartu AI untuk user (bahasa Inggris, sama seperti sisa UI app). Ini turunan dari
 * `kind`, bukan dari pesan server: pesan server tetap ada di AiFailure.message supaya
 * permukaan yang sudah punya bahasa sendiri (Alert di Timeline) bisa memakainya.
 */
export const AI_FAILURE_TEXT: Record<AiFailureKind, string> = {
  rate_limited: "You have asked the AI a bit too much — wait about a minute, then try again.",
  too_long: 'That request was too long for the AI service to process.',
  blocked: 'The AI service refused this request.',
  unavailable: 'The AI service is unavailable right now — try again in a moment.',
  not_configured: 'The AI service is not configured on the server yet.',
  bad_output: 'The AI service sent an answer that could not be used — try again.',
  moved: 'This app build calls a retired AI endpoint — it needs an update.',
  unknown: 'The AI service did not answer.',
};

function normalizeKind(value: unknown): AiFailureKind | null {
  const raw = String(value ?? '');
  return Object.prototype.hasOwnProperty.call(KIND_FALLBACK, raw)
    ? (raw as AiFailureKind)
    : null;
}

/**
 * Mengubah error SDK PocketBase / fetch menjadi AiFailure tanpa membuang status maupun
 * pesan yang dikirim server (F-45). `code` dari hook lebih dipercaya daripada status,
 * karena status 0 juga dipakai untuk jaringan yang putus.
 */
export function describeAiError(error: any): AiFailure {
  const fromBody = error?.response ?? error?.xhr?.response ?? null;
  const code = normalizeKind(fromBody?.code) ?? normalizeKind(error?.code);
  const status = Number(error?.status ?? error?.xhr?.status ?? fromBody?.status ?? 0);

  let kind: AiFailureKind | null = code;
  if (!kind) {
    if (status === 429) kind = 'rate_limited';
    else if (status === 413) kind = 'too_long';
    else if (status === 0 || status >= 500) kind = 'unavailable';
    else if (status === 400 && /not configured/i.test(String(error?.message ?? ''))) kind = 'not_configured';
  }
  if (!kind) kind = 'unknown';

  const serverMessage =
    typeof fromBody?.message === 'string' && fromBody.message.trim() !== ''
      ? fromBody.message.trim()
      : typeof error?.message === 'string' && !/^(abort|network|fetch)/i.test(error.message)
        ? error.message.trim()
        : '';

  return {
    kind,
    message: serverMessage || KIND_FALLBACK[kind],
    retryable: kind === 'rate_limited' || kind === 'unavailable',
  };
}

/** Kegagalan yang lahir di sisi klien: jawaban tidak bisa dipakai (F-42a/F-42c). */
export function badOutput(message?: string): AiFailure {
  return { kind: 'bad_output', message: message || KIND_FALLBACK.bad_output, retryable: true };
}

/**
 * Satu parser untuk keempat pemanggil (F-42b). Dulu ada tiga gaya: regex rakus
 * `/\{[\s\S]*\}/`, regex `/\[[\s\S]*\]/`, dan `replace(/```json|```/g)` — dua yang pertama
 * memotong salah kalau teks berisi kurung lebih dari satu objek, dan yang ketiga hanya
 * berlaku untuk satu fungsi.
 *
 * Diambil kurung pertama yang seimbang (depth counter yang menghormati string dan escape),
 * bukan greedy match. Mengembalikan null, tidak pernah melempar.
 */
export function parseAiJson(text: string): unknown | null {
  const cleaned = stripFences(String(text ?? ''));
  if (cleaned === '') return null;
  const direct = tryParse(cleaned);
  if (direct !== undefined) return direct;

  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const slice = balancedSlice(cleaned, start);
  if (!slice) return null;
  const parsed = tryParse(slice);
  return parsed === undefined ? null : parsed;
}

function stripFences(value: string): string {
  return value
    .replace(/^\s*```[a-zA-Z]*\s*/, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

function tryParse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Irisan kurung seimbang dari `from`; null kalau tidak tertutup. */
function balancedSlice(value: string, from: number): string | null {
  const open = value[from];
  const close = open === '{' ? '}' : open === '[' ? ']' : '';
  if (!close) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < value.length; i++) {
    const ch = value[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return value.slice(from, i + 1);
    }
  }
  return null;
}

/**
 * Batas panjang output (F-47): whitespace diringkas, karakter kontrol dibuang, lalu
 * dipotong dengan elipsis yang dihitung dalam batas.
 */
export function capText(value: unknown, max: number): string {
  const flat = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat === '') return '';
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * Membungkus data user di dalam prompt (F-47): delimiter menandai bahwa isinya konten,
 * bukan instruksi; `<` dan `>` dibuang supaya user tidak bisa menutup delimiter lebih
 * awal dan menyisipkan instruksi di luar blok data.
 */
export function wrapData(tag: string, value: unknown): string {
  const safe = String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
  return `<${tag}>${safe || '( kosong )'}</${tag}>`;
}

/** Semua bagian hasil AI lewat sini supaya tidak ada field tak berbatas yang keluar. */
export function ok<T>(value: T): AiResult<T> {
  return { value, failure: null };
}

export function fail<T>(failure: AiFailure): AiResult<T> {
  return { value: null, failure };
}
