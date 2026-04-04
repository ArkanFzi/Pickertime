import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="context-setup" />
      <Stack.Screen name="permissions" />
    </Stack>
  );
}
