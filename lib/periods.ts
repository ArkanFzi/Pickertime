// Satu sumber kosakata periode (F-64). Sebelum ini ada tiga potongan jam yang beredar
// di app yang sama: heatmap memotong 06–12 / 12–18 / sisanya, chip energi dashboard
// memotong Afternoon 12–17 dan Night Owl 20–02, sementara select Profiles.energy_pref
// menamai orangnya "Night Owl" — bukan nama bucket jam. Akibatnya "Best Time to Focus"
// tidak pernah bisa dibandingkan dengan preferensi user, padahal nilai energy_pref yang
// sama juga dikirim ke prompt AutoPlan (lib/gemini.ts).
//
// Nilai ENERGY_PREFS di sini wajib persis sama dengan select di skema; itu ditegakkan
// tools/test/enum-contract.mjs, bukan dihafal manusia.
export const TIME_BUCKETS = ['Morning', 'Afternoon', 'Evening'] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

export const ENERGY_PREFS = ['Morning', 'Afternoon', 'Night Owl'] as const;
export type EnergyPref = (typeof ENERGY_PREFS)[number];

// Pemotongan bucket heatmap. "Evening" sengaja mencakup lewat tengah malam
// (18:00–06:00), karena sesi fokus pk 01:00 tetap malam, bukan pagi.
export function bucketOfHour(hour: number): TimeBucket {
  if (hour >= 6 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 18) return 'Afternoon';
  return 'Evening';
}

// "Night Owl" dipetakan ke bucket jamnya supaya data dan preferensi dibandingkan pada
// skala yang sama.
export const PREF_BUCKET: Record<EnergyPref, TimeBucket> = {
  Morning: 'Morning',
  Afternoon: 'Afternoon',
  'Night Owl': 'Evening',
};

// Jendela "sedang puncak" per preferensi untuk chip energi dashboard. Sengaja lebih
// sempit dari bucket heatmap: orang yang bilang Night Owl tidak dianggap lagi puncak
// pada 18:00. Jendela lewat tengah malam dipecah dua supaya tidak ada logika wrap.
export const PREF_PEAK_HOURS: Record<EnergyPref, readonly (readonly [number, number])[]> = {
  Morning: [[6, 12]],
  Afternoon: [[12, 17]],
  'Night Owl': [[20, 24], [0, 2]],
};

export const DIP_HOURS: readonly [number, number] = [14, 16];

const isKnownPref = (pref: string): pref is EnergyPref =>
  (ENERGY_PREFS as readonly string[]).includes(pref);

export function isPeakHour(pref: string, hour: number): boolean {
  if (!isKnownPref(pref)) return false;
  return PREF_PEAK_HOURS[pref].some(([from, to]) => hour >= from && hour < to);
}

// Perilaku chip energi lama (app/(tabs)/index.tsx:19) dipindah apa adanya ke sini
// supaya jendela jamnya cuma ada satu dan bisa dinilai per jam, bukan per feeling.
export function energyStatus(pref: string, hour: number = new Date().getHours()): string {
  if (isPeakHour(pref, hour)) return 'High Energy';
  if (hour >= DIP_HOURS[0] && hour < DIP_HOURS[1]) return 'Post-Lunch Dip';
  return 'Building Momentum';
}

export const WEEK_DAY_COUNT = 7;

const zeroWeek = () => new Array(WEEK_DAY_COUNT).fill(0) as number[];

export type Heatmap = Record<TimeBucket, number[]>;

export function emptyHeatmap(): Heatmap {
  return { Morning: zeroWeek(), Afternoon: zeroWeek(), Evening: zeroWeek() };
}

/**
 * Kalimat kartu "Best Time to Focus": angka data nyata + perbandingan dengan preferensi
 * yang dipilih user, keduanya dalam kosakata yang sama. `pref` dari server bisa
 * kosong/nilai lama — kalau tidak dikenali, data saja yang dinyatakan tanpa
 * memaksa-maksa perbandingan.
 */
export function periodMatchSentence(
  pref: string | undefined | null,
  best: { bucket: TimeBucket; count: number; total: number } | null,
): string {
  if (!best) return 'No focus sessions logged this week yet.';
  const label = best.bucket.toLowerCase();
  const data = `${best.count} of ${best.total} sessions this week were in the ${label}`;
  if (!pref || !isKnownPref(pref)) return `${data}.`;
  return PREF_BUCKET[pref] === best.bucket
    ? `${data} — matches the ${pref} you picked.`
    : `${data}, but you picked ${pref}.`;
}
