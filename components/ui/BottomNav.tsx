import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const TABS = [
  { name: 'Home', icon: 'home', route: '/' },
  { name: 'Schedule', icon: 'calendar', route: '/schedule' },
  { name: 'Timeline', icon: 'list', route: '/timeline' },
  { name: 'Insights', icon: 'bar-chart', route: '/insights' },
];

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.route ||
            (tab.route === '/' && pathname === '/');

          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tab}
              onPress={() => router.push(tab.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Ionicons
                  name={(tab.icon + (isActive ? '' : '-outline')) as any}
                  size={22}
                  color={isActive ? '#00D4FF' : 'rgba(255,255,255,0.35)'}
                />
                {isActive && <View style={styles.dot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 15, 29, 0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    paddingBottom: 24,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
  },
  dot: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00D4FF',
  },
});
