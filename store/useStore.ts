import { create } from 'zustand';
import { AuthModel, RecordModel } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { scheduleTaskNotification, cancelTaskNotification, listArmedAlarmTaskIds } from '@/lib/notifications';
import { createTaskBatch, resolveLeadMinutes, type TaskWriter, type TaskWritePayload } from '@/lib/taskContract';
import { localDayStartEpoch } from '@/lib/localDay';

export type UserRole = 'Student' | 'Professional' | 'Freelancer' | 'Creator' | 'Researcher' | string;
export type EnergyPref = 'Morning' | 'Afternoon' | 'Night Owl';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: UserRole;
  focus_goal: string;
  energy_pref: EnergyPref;
}

export interface Task {
  id: string;
  user: string; // PocketBase relation field name is usually 'user'
  title: string;
  description?: string;
  category: string;
  priority: 'High' | 'Medium' | 'Low';
  start_time?: string;
  end_time?: string;
  duration_minutes: number;
  is_completed: boolean;
  has_alarm: boolean;
  alarm_minutes_before: number;
}

// ─── Payload types untuk fungsi sinkronisasi ────────────────────────────────
// Bentuknya tinggal di lib/taskContract supaya yang dipakai UI, AutoPlan, dan gate
// tools/test adalah tipe yang sama.
export type CreateTaskPayload = TaskWritePayload;

// Satu jalur tulis untuk task tunggal maupun batch — dua tempat yang sama-sama bisa
// lupa memvalidasi adalah cara F-02 bertahan.
const tasksWriter: TaskWriter<RecordModel> = {
  create: (data) => pb.collection('Tasks').create(data),
  remove: (id) => pb.collection('Tasks').delete(id),
};

const withTaskDefaults = (payload: CreateTaskPayload): CreateTaskPayload => ({
  ...payload,
  is_completed: payload.is_completed ?? false,
  has_alarm: payload.has_alarm ?? true,
  alarm_minutes_before: resolveLeadMinutes(payload.alarm_minutes_before),
});

interface AppState {
  // Auth
  user: AuthModel | null;
  profile: Profile | null;
  setUser: (user: AuthModel | null) => void;
  setProfile: (profile: Profile | null) => void;

  // Tasks — operasi lokal (digunakan oleh realtime subscription)
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  toggleTask: (id: string) => void;

  // Alarm yang benar-benar terdaftar di OS. Chip "Smart Alarm set" hanya boleh
  // bicara kalau id task ada di daftar ini (F-22).
  armedAlarms: string[];
  refreshArmedAlarms: () => Promise<void>;

  /**
   * Samakan alarm OS dengan kondisi task sekarang: jadwalkan ulang kalau masih
   * butuh alarm, batalkan kalau selesai/tanpa alarm/dihapus.
   */
  syncTaskAlarm: (task: Task) => Promise<void>;

  // ─── Fungsi Sinkronisasi Terpusat ────────────────────────────────────────
  // Setiap fungsi sync_ melakukan pemanggilan API PocketBase + update state
  // Zustand secara atomik dalam satu transaksi, mencegah desinkronisasi data.

  /**
   * Membuat task baru di PocketBase, lalu menambahkannya ke state lokal.
   * Juga otomatis menjadwalkan notifikasi lokal.
   * @throws Error jika gagal (jaringan, validasi, dll)
   */
  syncAddTask: (payload: CreateTaskPayload) => Promise<Task>;

  /**
   * Bulk insert tasks to PocketBase, then update local state.
   */
  syncAddMultipleTasks: (payloads: CreateTaskPayload[]) => Promise<Task[]>;

  /**
   * Memperbarui field tertentu sebuah task di PocketBase,
   * lalu merefleksikannya ke state lokal.
   * @throws Error jika gagal
   */
  syncUpdateTask: (id: string, updates: Partial<Task>) => Promise<Task>;

  /**
   * Toggle is_completed sebuah task di PocketBase + state lokal.
   * @throws Error jika gagal
   */
  syncToggleTask: (id: string) => Promise<void>;

  /**
   * Menunda task berikutnya dengan menggeser start_time dan end_time
   * sebesar `minutesToAdd` menit di PocketBase + state lokal.
   * @throws Error jika gagal
   */
  syncSnoozeTask: (id: string, minutesToAdd: number) => Promise<void>;

  /**
   * Menghapus task dari PocketBase + state lokal.
   * @throws Error jika gagal
   */
  syncDeleteTask: (id: string) => Promise<void>;

  // Focus Session
  activeTask: Task | null;
  timerSeconds: number;
  isRunning: boolean;
  setActiveTask: (task: Task | null) => void;
  setTimerSeconds: (seconds: number) => void;
  setIsRunning: (val: boolean) => void;

  /**
   * Mengambil daftar task dari PocketBase untuk hari ini dan menyimpannya di Zustand.
   * Kegagalan dicatat di `tasksError` supaya layar tidak diam-diam menampilkan data basi.
   */
  syncFetchTasks: () => Promise<void>;
  tasksError: string | null;

  // Snooze analytics
  snoozeCount: number;
  incrementSnooze: () => void;

  // Onboarding
  onboardingComplete: boolean;
  setOnboardingComplete: (val: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // ─── Auth ──────────────────────────────────────────────────────────────────
  user: null,
  profile: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),

  // ─── Tasks (operasi lokal) ──────────────────────────────────────────────────
  tasks: [],
  tasksError: null,
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  toggleTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, is_completed: !t.is_completed } : t
      ),
    })),

  // ─── Alarm ──────────────────────────────────────────────────────────────────
  armedAlarms: [],
  refreshArmedAlarms: async () => {
    set({ armedAlarms: await listArmedAlarmTaskIds() });
  },

  syncTaskAlarm: async (task) => {
    if (task.has_alarm && !task.is_completed && task.start_time) {
      await scheduleTaskNotification(task);
    } else {
      await cancelTaskNotification(task.id);
    }
    await get().refreshArmedAlarms();
  },

  // ─── syncAddTask ────────────────────────────────────────────────────────────
  syncAddTask: async (payload) => {
    // 1. Validasi + tulis lewat jalur batch yang sama (task tunggal = batch isi satu)
    const [data] = await createTaskBatch(tasksWriter, [withTaskDefaults(payload)]);

    const newTask = data as unknown as Task;

    // 2. Hanya jika server berhasil, perbarui state lokal
    set((state) => ({ tasks: [newTask, ...state.tasks] }));

    // 3. Jadwalkan alarm lokal. Dulu dipanggil tanpa await, jadi kegagalannya
    // tidak pernah sampai ke catch dan state alarm tidak pernah dibaca ulang.
    try {
      await get().syncTaskAlarm(newTask);
    } catch (notifErr) {
      // Notifikasi gagal bukan alasan untuk gagalkan seluruh operasi
      console.warn('[syncAddTask] Failed to schedule notification:', notifErr);
    }

    return newTask;
  },

  // ─── syncAddMultipleTasks ───────────────────────────────────────────────────
  syncAddMultipleTasks: async (payloads) => {
    // createTaskBatch menolak seluruh batch sebelum baris pertama ditulis kalau ada
    // payload haram, dan membatalkan baris yang terlanjur tertulis kalau server yang
    // gagal. State lokal baru disentuh setelah semua berhasil (F-02).
    const created = await createTaskBatch(tasksWriter, payloads.map(withTaskDefaults));
    const newTasks = created as unknown as Task[];

    set((state) => ({ tasks: [...newTasks, ...state.tasks] }));

    for (const t of newTasks) {
      try {
        await get().syncTaskAlarm(t);
      } catch (e) {
        console.warn('Failed scheduling notification:', e);
      }
    }

    return newTasks;
  },

  // ─── syncUpdateTask ─────────────────────────────────────────────────────────
  syncUpdateTask: async (id, updates) => {
    // 1. Kirim ke server
    const data = await pb.collection('Tasks').update(id, updates);
    const updatedTask = data as unknown as Task;

    // 2. Hanya jika server berhasil, perbarui state lokal
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));

    // 3. Jadwal berubah = alarm lama salah. Pasang ulang sesuai kondisi terbaru.
    const merged = get().tasks.find((t) => t.id === id);
    if (merged) await get().syncTaskAlarm(merged);

    return updatedTask;
  },

  // ─── syncToggleTask ─────────────────────────────────────────────────────────
  syncToggleTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task dengan id "${id}" tidak ditemukan di state.`);

    const newValue = !task.is_completed;

    // 1. Kirim ke server
    await pb.collection('Tasks').update(id, { is_completed: newValue });

    // 2. Hanya jika server berhasil, perbarui state lokal
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, is_completed: newValue } : t
      ),
    }));

    // 3. Task selesai tidak boleh membangunkan user nanti
    const after = get().tasks.find((t) => t.id === id);
    if (after) await get().syncTaskAlarm(after);
  },

  // ─── syncSnoozeTask ─────────────────────────────────────────────────────────
  syncSnoozeTask: async (id, minutesToAdd) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task dengan id "${id}" tidak ditemukan di state.`);

    if (!task.start_time || !task.end_time) {
      throw new Error('Task tidak memiliki start_time atau end_time untuk di-snooze.');
    }

    const newStart = new Date(
      new Date(task.start_time).getTime() + minutesToAdd * 60 * 1000
    ).toISOString();

    const newEnd = new Date(
      new Date(task.end_time).getTime() + minutesToAdd * 60 * 1000
    ).toISOString();

    const updates = { start_time: newStart, end_time: newEnd };

    // 1. Kirim ke server
    await pb.collection('Tasks').update(id, updates);

    // 2. Hanya jika server berhasil, perbarui state lokal
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));

    // 3. Alarm harus ikut bergeser, tidak boleh berbunyi pada jadwal lama
    const afterSnooze = get().tasks.find((t) => t.id === id);
    if (afterSnooze) await get().syncTaskAlarm(afterSnooze);

    get().incrementSnooze();
  },

  // ─── syncDeleteTask ─────────────────────────────────────────────────────────
  syncDeleteTask: async (id) => {
    const taskIndex = get().tasks.findIndex((t) => t.id === id);
    if (taskIndex === -1) throw new Error(`Task dengan id "${id}" tidak ditemukan.`);

    // 1. Kirim ke server
    await pb.collection('Tasks').delete(id);

    // 2. Hanya jika server berhasil, hapus dari state lokal
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));

    // 3. Task yang dihapus tidak boleh meninggalkan alarm yatim
    await cancelTaskNotification(id);
    await get().refreshArmedAlarms();
  },

  // ─── syncFetchTasks ─────────────────────────────────────────────────────────
  syncFetchTasks: async () => {
    const user = get().user || pb.authStore.model;
    if (!user) return;
    try {
      const batasHari = localDayStartEpoch();
      const records = await pb.collection('Tasks').getFullList({
        filter: `user = "${user.id}" && start_time >= ${batasHari}`,
        sort: 'start_time',
      });
      if (records) {
        set({ tasks: records as any, tasksError: null });
        await get().refreshArmedAlarms();
      }
    } catch (err) {
      console.error('Fetch tasks error:', err);
      set({ tasksError: 'Daftar tugas gagal dimuat dari server. Isi yang tampil bisa basi.' });
    }
  },

  // ─── Snooze Analytics ───────────────────────────────────────────────────────
  snoozeCount: 0,
  incrementSnooze: () => set((state) => ({ snoozeCount: state.snoozeCount + 1 })),

  // ─── Focus Session ──────────────────────────────────────────────────────────
  activeTask: null,
  timerSeconds: 0,
  isRunning: false,
  setActiveTask: (task) => set({ activeTask: task }),
  setTimerSeconds: (timerSeconds) => set({ timerSeconds }),
  setIsRunning: (val) => set({ isRunning: val }),

  // ─── Onboarding ─────────────────────────────────────────────────────────────
  onboardingComplete: false,
  setOnboardingComplete: (val) => set({ onboardingComplete: val }),
}));
