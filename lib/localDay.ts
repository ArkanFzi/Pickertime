// Batas waktu untuk filter PocketBase dikirim sebagai detik UTC (epoch), bukan string ISO.
// Dua alasan terukur di backend uji: (1) batas "hari ini" harus dihitung dari kalender
// perangkat — task 05:00 WIB disimpan 2026-10-08 22:00:00.000Z, jadi pemotongan tengah
// malam UTC buangnya mulai 07:00 WIB (F-34); (2) literal ber-huruf "T" dibandingkan
// PocketBase sebagai TEKS terhadap kolom tanggal yang berbentuk "YYYY-MM-DD HH:MM:SS.mmmZ"
// karena ' ' < 'T', sehingga atas satu baris data: `start_time >= "2026-10-08T17:00:00.000Z"`
// -> 0 baris, sementara bentuk "2026-10-08 17:00:00.000Z" dan epoch 1791478800 -> 1 baris (F-79).
export function toPbEpoch(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

export function localDayStartEpoch(now: Date = new Date()): number {
  return toPbEpoch(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Awal minggu kalender perangkat (Senin), dipakai statistik mingguan Insights. */
export function localWeekStart(now: Date = new Date(), firstDay = 1): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() - firstDay + 7) % 7));
  return start;
}

export function localWeekStartEpoch(now: Date = new Date(), firstDay = 1): number {
  return toPbEpoch(localWeekStart(now, firstDay));
}

/**
 * Indeks kolom minggu (0 = Senin) untuk satu titik waktu. Dipakai heatmap Insights;
 * dulu barisnya ditulis sebagai `(d.getDay() === 0 ? 6 : d.getDay() - 1)` di samping
 * `localWeekStart()` yang sudah ada — dua rumus minggu dalam satu file (F-63).
 */
export function localWeekDayIndex(at: Date, firstDay = 1): number {
  const diffDays = (at.getTime() - localWeekStart(at, firstDay).getTime()) / 86_400_000;
  return Math.floor(diffDays);
}
