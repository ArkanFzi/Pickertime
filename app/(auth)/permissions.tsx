import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

const PERMISSIONS = [
  {
    id: 'notifications',
    icon: 'notifications',
    iconColor: '#00D4FF',
    bgColor: 'rgba(0,212,255,0.12)',
    borderColor: 'rgba(0,212,255,0.3)',
    title: 'Smart Notifications',
    subtitle: 'Alerts for transitions & breaks',
    desc: 'Required for context-aware alarms that gently pull you out of deep focus blocks before your next meeting.',
    required: true,
  },
  {
    id: 'calendar',
    icon: 'calendar-outline',
    iconColor: 'rgba(255,255,255,0.6)',
    bgColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.10)',
    title: 'Calendar Sync',
    subtitle: 'Google, Outlook, Apple',
    desc: 'Optional. Allows Pickertime to automatically block time around your existing meetings.',
    required: false,
  },
  {
    id: 'dnd',
    icon: 'moon-outline',
    iconColor: 'rgba(255,255,255,0.6)',
    bgColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.10)',
    title: 'DND / Focus Control',
    subtitle: 'System-level silencer',
    desc: 'Auto-silence non-essential alerts during your designated "Deep Flow" or "Pomodoro" sessions.',
    required: false,
  },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    notifications: true,
    calendar: false,
    dnd: false,
  });
  const pulseAnim = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  async function handleEnable() {
    if (enabled.notifications) {
      const { status } = await Notifications.requestPermissionsAsync();
    }
    router.replace('/');
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <View style={styles.progressDots}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.dot, i === 3 ? styles.dotActive : i < 3 ? styles.dotDone : styles.dotInactive]} />
            ))}
          </View>
          <TouchableOpacity onPress={() => router.replace('/')}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>System Access</Text>
        <Text style={styles.subtitle}>
          Step 3/4: Enable integrations to allow Pickertime to actively manage your schedule and protect your focus.
        </Text>

        {/* Permission Cards */}
        {PERMISSIONS.map((perm) => (
          <View key={perm.id} style={styles.permCard}>
            <View style={styles.permTop}>
              <View style={styles.permLeft}>
                <View style={[styles.permIcon, { backgroundColor: perm.bgColor, borderColor: perm.borderColor }]}>
                  <Ionicons name={perm.icon as any} size={22} color={perm.iconColor} />
                </View>
                <View>
                  <Text style={styles.permTitle}>{perm.title}</Text>
                  <Text style={styles.permSub}>{perm.subtitle}</Text>
                </View>
              </View>
              <Switch
                value={enabled[perm.id]}
                onValueChange={(val) => setEnabled((prev) => ({ ...prev, [perm.id]: val }))}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(0,212,255,0.3)' }}
                thumbColor={enabled[perm.id] ? '#00D4FF' : 'rgba(255,255,255,0.8)'}
                ios_backgroundColor="rgba(255,255,255,0.1)"
              />
            </View>
            <View style={styles.permDescBox}>
              <Text style={styles.permDesc}>
                {perm.required ? '' : <Text style={styles.optional}>Optional. </Text>}
                {perm.desc}
              </Text>
            </View>
          </View>
        ))}

        {/* Smart Alarm Preview */}
        <Text style={styles.sectionLabel}>PREVIEW: SMART ALARM</Text>
        <View style={styles.alarmPreview}>
          <View style={styles.alarmGlow} />
          <View style={styles.alarmRow}>
            <Animated.View style={[styles.alarmIcon, { transform: [{ scale: pulseAnim }] }]}>
              <Ionicons name="timer-outline" size={24} color="#00D4FF" />
            </Animated.View>
            <View style={styles.alarmText}>
              <View style={styles.alarmTitleRow}>
                <Text style={styles.alarmTitle}>Deep Work Concluding</Text>
                <View style={styles.nowBadge}><Text style={styles.nowText}>Now</Text></View>
              </View>
              <Text style={styles.alarmDesc}>5 mins until "Team Sync". Wrap up your current thought process.</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleEnable} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Enable Selected Access</Text>
          <Ionicons name="checkmark" size={18} color="#0A0F1D" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipFullBtn} onPress={() => router.replace('/')}>
          <Text style={styles.skipFullText}>Not now, configure later</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F1D' },
  glow: {
    position: 'absolute', top: -150, left: 0, right: 0, height: 400,
    borderRadius: 300, backgroundColor: 'rgba(0,212,255,0.05)',
  },
  content: { maxWidth: 420, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingBottom: 60 },
  header: { paddingTop: 56, marginBottom: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  progressDots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  dotActive: { width: 28, backgroundColor: '#00D4FF' },
  dotDone: { width: 8, backgroundColor: 'rgba(0,212,255,0.5)' },
  dotInactive: { width: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  skipText: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.4)' },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 8 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 22, marginBottom: 28 },
  permCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 24, padding: 18, marginBottom: 14, gap: 12,
  },
  permTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  permLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  permIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  permTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  permSub: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  permDescBox: {
    backgroundColor: 'rgba(10,15,29,0.5)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  permDesc: { fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 18 },
  optional: { color: 'rgba(0,212,255,0.8)', fontWeight: '600' },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 10, marginTop: 8 },
  alarmPreview: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
    borderRadius: 24, padding: 16, marginBottom: 28, overflow: 'hidden',
  },
  alarmGlow: {
    position: 'absolute', top: -20, right: -20, width: 80, height: 80,
    borderRadius: 40, backgroundColor: 'rgba(0,212,255,0.15)',
  },
  alarmRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  alarmIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(0,212,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  alarmText: { flex: 1 },
  alarmTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  alarmTitle: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
  nowBadge: {
    backgroundColor: 'rgba(0,212,255,0.15)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8,
  },
  nowText: { fontSize: 10, color: '#00D4FF', fontWeight: '700' },
  alarmDesc: { fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 17 },
  primaryBtn: {
    backgroundColor: '#00D4FF', borderRadius: 18, paddingVertical: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8, marginBottom: 12,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0F1D' },
  skipFullBtn: { alignItems: 'center', paddingVertical: 12 },
  skipFullText: { fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },
});
