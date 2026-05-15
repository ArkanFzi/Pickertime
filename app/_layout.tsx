import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';

import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { pb } from '@/lib/pocketbase';
import { useStore } from '@/store/useStore';

SplashScreen.preventAutoHideAsync();

// Only set notification handler outside Expo Go (SDK 53+ removed push support from Expo Go)
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
if (!isExpoGo) {
  import('expo-notifications').then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  });
}


export default function RootLayout() {
  const router = useRouter();
  const { setUser, setProfile } = useStore();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial check
    if (pb.authStore.isValid) {
      setUser(pb.authStore.model);
      loadProfile(pb.authStore.model!.id);
    }
    setLoading(false);
    SplashScreen.hideAsync();

    // Listen to auth changes
    const removeListener = pb.authStore.onChange((token, model) => {
      if (model) {
        setUser(model);
        loadProfile(model.id);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    // Notification tap listener — only works in development builds, not Expo Go SDK 53+
    let notificationSub: { remove: () => void } | null = null;
    if (!isExpoGo) {
      import('expo-notifications').then((Notifications) => {
        notificationSub = Notifications.addNotificationResponseReceivedListener(
          (response: import('expo-notifications').NotificationResponse) => {
            const data = response.notification.request.content.data;
            if (data?.type === 'smart-alarm') {
              router.push('/smart-alarm');
            }
          }
        );
      });
    }

    return () => {
      removeListener();
      notificationSub?.remove();
    };
  }, []);


  async function loadProfile(userId: string) {
    try {
      const data = await pb.collection('Profiles').getOne(userId);
      if (data) setProfile(data as any);
    } catch (e) {
      console.error('Profile load error:', e);
    }
  }

  if (loading) return null;

  return (
    <>
      <StatusBar style="light" backgroundColor="#0A0F1D" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="focus" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="smart-alarm" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}
