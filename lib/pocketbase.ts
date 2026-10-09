import 'react-native-url-polyfill/auto';
import PocketBase, { AsyncAuthStore } from 'pocketbase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Tidak ada polyfill EventSource di sini: belum ada satu pun `pb.realtime.subscribe()` di
// aplikasi, dan memasangnya perlu dibuktikan di perangkat lebih dulu (lihat F-49).

export const PB_URL =
  process.env.EXPO_PUBLIC_POCKETBASE_URL ||
  process.env.EXPO_PUBLIC_PB_URL ||
  'https://api.elarisnoir.my.id';

const authStore = new AsyncAuthStore({
  save: async (serialized) => await AsyncStorage.setItem('pb_auth', serialized),
  initial: AsyncStorage.getItem('pb_auth'),
  clear: async () => await AsyncStorage.removeItem('pb_auth'),
});

export const pb = new PocketBase(PB_URL, authStore);

// Disable auto-cancellation to prevent issues with React concurrency
pb.autoCancellation(false);

export async function loadInitialAuth() {
  try {
    const raw = await AsyncStorage.getItem('pb_auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.token && (parsed?.record || parsed?.model)) {
        pb.authStore.save(parsed.token, parsed.record || parsed.model);
        return parsed.record || parsed.model;
      }
    }
  } catch (e) {
    console.warn('Failed to load stored auth:', e);
  }
  return null;
}
