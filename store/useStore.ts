import { create } from 'zustand';
import { AuthModel } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { scheduleTaskNotification } from '@/lib/notifications';

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
export interface CreateTaskPayload {
  user: string;
  title: string;
  description?: string;
  category: string;
  priority: 'High' | 'Medium' | 'Low';
  start_time?: string;
  end_time?: string;
  duration_minutes: number;
  is_completed?: boolean;
  has_alarm?: boolean;
  alarm_minutes_before?: number;
}

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

  // Focus Session
  activeTask: Task | null;
  timerSeconds: number;
  isRunning: boolean;
  setActiveTask: (task: Task | null) => void;
  setTimerSeconds: (seconds: number) => void;
  setIsRunning: (val: boolean) => void;

  /**
   * Mengambil daftar task dari PocketBase untuk hari ini dan menyimpannya di Zustand
   */
  syncFetchTasks: () => Promise<void>;

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

  // ─── syncAddTask ────────────────────────────────────────────────────────────
  syncAddTask: async (payload) => {
    // 1. Kirim ke server terlebih dahulu
    const data = await pb.collection('Tasks').create({
      ...payload,
      is_completed: payload.is_completed ?? false,
      has_alarm: payload.has_alarm ?? true,
      alarm_minutes_before: payload.alarm_minutes_before ?? 10,
    });

    const newTask = data as unknown as Task;

    // 2. Hanya jika server berhasil, perbarui state lokal
    set((state) => ({ tasks: [newTask, ...state.tasks] }));

    // 3. Jadwalkan notifikasi lokal
    try {
      scheduleTaskNotification(newTask);
    } catch (notifErr) {
      // Notifikasi gagal bukan alasan untuk gagalkan seluruh operasi
      console.warn('[syncAddTask] Failed to schedule notification:', notifErr);
    }

    return newTask;
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

    get().incrementSnooze();
  },

  // ─── syncFetchTasks ─────────────────────────────────────────────────────────
  syncFetchTasks: async () => {
    const user = get().user || pb.authStore.model;
    if (!user) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const records = await pb.collection('Tasks').getFullList({
        filter: `user = "${user.id}" && start_time >= "${today}"`,
        sort: 'start_time',
      });
      if (records) {
        set({ tasks: records as any });
      }
    } catch (err) {
      console.error('Fetch tasks error:', err);
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
