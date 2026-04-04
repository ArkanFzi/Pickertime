import { create } from 'zustand';
import { User } from '@supabase/supabase-js';

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
  user_id: string;
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

interface AppState {
  // Auth
  user: User | null;
  profile: Profile | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;

  // Tasks
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  toggleTask: (id: string) => void;

  // Focus Session
  activeTask: Task | null;
  timerSeconds: number;
  isRunning: boolean;
  setActiveTask: (task: Task | null) => void;
  setTimerSeconds: (seconds: number) => void;
  setIsRunning: (val: boolean) => void;

  // Onboarding
  onboardingComplete: boolean;
  setOnboardingComplete: (val: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  profile: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),

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

  activeTask: null,
  timerSeconds: 0,
  isRunning: false,
  setActiveTask: (task) => set({ activeTask: task }),
  setTimerSeconds: (timerSeconds) => set({ timerSeconds }),
  setIsRunning: (val) => set({ isRunning: val }),

  onboardingComplete: false,
  setOnboardingComplete: (val) => set({ onboardingComplete: val }),
}));
