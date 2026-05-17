import 'react-native-url-polyfill/auto';
import PocketBase, { AsyncAuthStore } from 'pocketbase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventSource from 'react-native-sse';

// Polyfill EventSource for React Native Realtime Subscriptions
if (!global.EventSource) {
  (global as any).EventSource = EventSource;
}

export const PB_URL = process.env.EXPO_PUBLIC_POCKETBASE_URL || 'https://api.elarisnoir.my.id';

const authStore = new AsyncAuthStore({
  save: async (serialized) => await AsyncStorage.setItem('pb_auth', serialized),
  initial: AsyncStorage.getItem('pb_auth'),
  clear: async () => await AsyncStorage.removeItem('pb_auth'),
});

export const pb = new PocketBase(PB_URL, authStore);

// Disable auto-cancellation to prevent issues with React concurrency
pb.autoCancellation(false);
