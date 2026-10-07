// Kontrak sisi klien untuk menulis koleksi Tasks. File ini sengaja tidak mengimpor apa pun
// dari React Native / PocketBase supaya tools/test bisa menjalankan fungsinya langsung
// di node (type stripping) dan memeriksa perilakunya dengan kolektor tiruan.

// Nilai select `Tasks.category` menurut snapshot skema di pb_migrations.
export const TASK_CATEGORIES = ['Work', 'Study', 'Health', 'Personal', 'Other'];
export const TASK_PRIORITIES = ['High', 'Medium', 'Low'];

export type TaskWritePayload = {
  user: string;
  title: string;
  description?: string;
  category: string;
  priority?: 'High' | 'Medium' | 'Low';
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number;
  is_completed?: boolean;
  has_alarm?: boolean;
  alarm_minutes_before?: number;
};

/**
 * Kembalikan pesan masalah atau null kalau payload aman ditulis.
 * Aturan ini meniru yang ditegakkan server (title wajib, category/priority select),
 * jadi penolakan diketahui sebelum satu baris pun ditulis (F-02).
 */
export function taskPayloadError(payload: TaskWritePayload): string | null {
  if (typeof payload.title !== 'string' || payload.title.trim() === '') {
    return 'title wajib diisi';
  }
  if (!TASK_CATEGORIES.includes(payload.category)) {
    return `category "${payload.category}" tidak ada di Tasks.category (${TASK_CATEGORIES.join(', ')})`;
  }
  if (payload.priority !== undefined && !TASK_PRIORITIES.includes(payload.priority)) {
    return `priority "${payload.priority}" tidak ada di Tasks.priority`;
  }
  return null;
}

export type TaskWriter<T> = {
  create: (data: TaskWritePayload) => Promise<T>;
  remove: (id: string) => Promise<unknown>;
};

/**
 * Tulis banyak task sekaligus tanpa meninggalkan baris yatim:
 * 1. semua payload diperiksa dulu, tidak ada yang ditulis kalau ada yang haram;
 * 2. kalau server menolak di tengah jalan, task yang sudah tertulis dihapus lagi (F-02).
 *
 * PocketBase tidak menyediakan transaksi lintas record untuk record user (endpoint /api/batch
 * menjawab 403 "Batch requests are not allowed" — terukur di backend uji), jadi rollback
 * kompensatori ini adalah sebanyak yang bisa dijanjikan dari sisi klien.
 */
export async function createTaskBatch<T extends { id: string }>(
  writer: TaskWriter<T>,
  payloads: TaskWritePayload[]
): Promise<T[]> {
  for (let i = 0; i < payloads.length; i++) {
    const error = taskPayloadError(payloads[i]);
    if (error) throw new Error(`Task ${i + 1} dari ${payloads.length} ditolak sebelum ditulis: ${error}`);
  }

  const created: T[] = [];
  try {
    for (const payload of payloads) {
      created.push(await writer.create(payload));
    }
  } catch (err) {
    const leftovers: string[] = [];
    for (const record of created) {
      try {
        await writer.remove(record.id);
      } catch {
        leftovers.push(record.id);
      }
    }
    const note = leftovers.length
      ? `${created.length - leftovers.length} dibatalkan, tapi ${leftovers.join(', ')} tetap tertinggal`
      : `${created.length} task yang sudah tertulis dibatalkan`;
    throw new Error(`${errMessage(err)} — batch dihentikan; ${note}`, { cause: err });
  }

  return created;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
