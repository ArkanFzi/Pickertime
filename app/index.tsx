import { Redirect } from 'expo-router';
import { useStore } from '@/store/useStore';

export default function Index() {
  const { user } = useStore();

  // If user is authenticated, send to Dashboard (tabs index)
  // Otherwise, send to the Welcome/Onboarding flow
  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
