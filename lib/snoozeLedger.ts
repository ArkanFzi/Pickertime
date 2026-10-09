// Ledger snooze per hari kalender perangkat (F-65). `snoozeCount` lama cuma angka di
// state yang hilang setiap aplikasi dibuka ulang, lalu di kartu "Snooze Rate" dibagi
// jumlah task seminggu: pembilang dari satu sesi, penyebut dari tujuh hari. Rasio itu
// bukan ukuran apa pun. Di sini tiap hari punya kolom sendiri dan angkanya dibaca apa
// adanya — "snooze hari ini" dan "snooze sejak Senin", tanpa pengiraan.
//
// Kunci hari = epoch detik awal hari kalender perangkat (localDayStartEpoch), bukan
// string ISO, mengikuti alasan F-34/F-79 di lib/localDay.ts.
export interface SnoozeLedger {
  byDay: Record<string, number>;
}

export function emptyLedger(): SnoozeLedger {
  return { byDay: {} };
}

const key = (dayEpoch: number): string => String(Math.floor(dayEpoch));

export function bumpSnooze(ledger: SnoozeLedger, dayEpoch: number): SnoozeLedger {
  const k = key(dayEpoch);
  return { byDay: { ...ledger.byDay, [k]: (ledger.byDay[k] ?? 0) + 1 } };
}

export function snoozesOn(ledger: SnoozeLedger, dayEpoch: number): number {
  return ledger.byDay[key(dayEpoch)] ?? 0;
}

/** Jumlah snooze pada hari-hari mulai `fromDayEpoch` (inklusif) sampai sekarang. */
export function sumSince(ledger: SnoozeLedger, fromDayEpoch: number): number {
  const batas = Math.floor(fromDayEpoch);
  return Object.entries(ledger.byDay)
    .filter(([day]) => Number(day) >= batas)
    .reduce((total, [, n]) => total + n, 0);
}

/** Buang hari-hari sebelum `keepFromDayEpoch` supaya peta tidak tumbuh tanpa batas. */
export function pruneBefore(ledger: SnoozeLedger, keepFromDayEpoch: number): SnoozeLedger {
  const batas = Math.floor(keepFromDayEpoch);
  const byDay: Record<string, number> = {};
  for (const [day, n] of Object.entries(ledger.byDay)) {
    if (Number(day) >= batas) byDay[day] = n;
  }
  return { byDay };
}

/**
 * Baca kembali apa yang pernah ditulis AsyncStorage. Ini batas sistem (isi file bisa
 * dari versi app lama atau rusak di tengah jalan), jadi apa pun yang bukan bilangan
 * bulat non-negatif dibuang, bukan dipercaya lalu dipakai berhitung.
 */
export function parseLedger(raw: string | null | undefined): SnoozeLedger {
  if (!raw) return emptyLedger();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyLedger();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyLedger();
  const byDay: Record<string, number> = {};
  for (const [day, n] of Object.entries(parsed as Record<string, unknown>)) {
    const epoch = Number(day);
    if (!Number.isFinite(epoch)) continue;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) continue;
    byDay[String(Math.floor(epoch))] = n;
  }
  return { byDay };
}

/** Yang disimpan di AsyncStorage adalah peta hari->jumlah itu sendiri, tanpa pembungkus. */
export function serializeLedger(ledger: SnoozeLedger): string {
  return JSON.stringify(ledger.byDay);
}
