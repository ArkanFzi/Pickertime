import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(10, 15, 29, 0.95)',
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 20,
          height: 78,
        },
        tabBarActiveTintColor: '#00D4FF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.3)',
        tabBarLabelStyle: { display: 'none' },
        tabBarIconStyle: { marginBottom: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'list' : 'list-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
