import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/store/useStore';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { tasksError, syncFetchTasks } = useStore();

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: 'rgba(10, 15, 29, 0.95)',
            borderTopColor: 'rgba(255,255,255,0.08)',
            borderTopWidth: 1,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 12),
            height: 60 + Math.max(insets.bottom, 12),
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
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Tanpa ini layar tetap tampak normal sambil menyajikan data basi (F-28). */}
      {tasksError ? (
        <View style={[styles.syncBanner, { top: insets.top }]}>
          <Ionicons name="cloud-offline-outline" size={16} color="#F59E0B" />
          <Text style={styles.syncBannerText}>{tasksError}</Text>
          <TouchableOpacity onPress={() => syncFetchTasks()} accessibilityRole="button">
            <Text style={styles.syncBannerRetry}>Coba lagi</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0F1D' },
  syncBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    zIndex: 50,
  },
  syncBannerText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },
  syncBannerRetry: { fontSize: 12, fontWeight: '700', color: '#F59E0B' },
});
