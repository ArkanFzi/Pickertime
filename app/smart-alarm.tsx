import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/store/useStore';

const PREP_STEPS: Record<string, Array<{ icon: string; text: string }>> = {
  Student: [
    { icon: 'laptop-outline', text: 'Open textbook & notes app' },
    { icon: 'cafe-outline', text: 'Get water or coffee' },
    { icon: 'phone-portrait-outline', text: 'Put phone face-down' },
  ],
  Professional: [
    { icon: 'document-text-outline', text: 'Open relevant docs & tools' },
    { icon: 'headset-outline', text: 'Put on noise-cancelling headphones' },
    { icon: 'notifications-off-outline', text: 'Set Slack to DND' },
  ],
  Creator: [
    { icon: 'color-palette-outline', text: 'Open creative tools' },
    { icon: 'musical-note-outline', text: 'Start ambient playlist' },
    { icon: 'cafe-outline', text: 'Get your beverage' },
  ],
  Freelancer: [
    { icon: 'document-outline', text: 'Open project files' },
    { icon: 'timer-outline', text: 'Set a clear deliverable goal' },
    { icon: 'cafe-outline', text: 'Refill water bottle' },
  ],
  Researcher: [
    { icon: 'library-outline', text: 'Open references & papers' },
    { icon: 'create-outline', text: 'Prepare notes document' },
    { icon: 'headset-outline', text: 'Put on focus music' },
  ],
};

export default function SmartAlarmScreen() {
  const router = useRouter();
  const { profile, tasks } = useStore();
  const role = profile?.role || 'Professional';
  const prepSteps = PREP_STEPS[role] || PREP_STEPS['Professional'];
  const nextTask = tasks.find((t) => !t.is_completed);

  const fadeAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const slideAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(20))).current;
  const countAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeAnims.forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(i * 120),
        Animated.parallel([
          Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(slideAnims[i], { toValue: 0, duration: 500, useNativeDriver: true }),
        ]),
      ]).start();
    });

    Animated.loop(
      Animated.sequence([
        Animated.timing(countAnim, { toValue: 1.03, duration: 1500, useNativeDriver: true }),
        Animated.timing(countAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  function Anim(i: number) {
    return { opacity: fadeAnims[i], transform: [{ translateY: slideAnims[i] }] };
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />
      <View style={styles.dotGrid} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={styles.alertBadge}>
          <Animated.View style={[styles.alertDot, { transform: [{ scale: countAnim }] }]} />
          <Text style={styles.alertBadgeText}>Smart Alert</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero Countdown */}
        <Animated.View style={[styles.heroCard, Anim(0)]}>
          <View style={styles.heroGlow} />
          <Text style={styles.nextUpLabel}>Next up in</Text>
          <Animated.View style={{ transform: [{ scale: countAnim }] }}>
            <Text style={styles.countdown}>14<Text style={styles.countdownSmall}>m</Text></Text>
          </Animated.View>
          <View style={styles.heroDivider} />
          <Text style={styles.heroTask}>{nextTask?.title || 'Deep Work Block'}</Text>
          <Text style={styles.heroSub}>Stay prepared — you're on track</Text>
        </Animated.View>

        {/* AI Insight Chip */}
        <Animated.View style={[styles.insightCard, Anim(1)]}>
          <View style={styles.insightIcon}>
            <Ionicons name="hardware-chip-outline" size={16} color="#A78BFA" />
          </View>
          <Text style={styles.insightText}>
            <Text style={styles.insightBold}>Insight: </Text>
            {role === 'Student'
              ? 'You have 35 free minutes before your study session — perfect for a quick review.'
              : role === 'Creator'
              ? 'Your creative output peaks in the next window. Clear your mind now.'
              : 'Your focus block aligns with your peak energy. Prepare to enter flow state.'}
          </Text>
        </Animated.View>

        {/* Prep Steps */}
        <Animated.View style={Anim(2)}>
          <View style={styles.prepHeader}>
            <Ionicons name="list-outline" size={16} color="#00D4FF" />
            <Text style={styles.prepTitle}>Recommended Prep</Text>
          </View>
          <View style={styles.prepList}>
            {prepSteps.map((step, i) => (
              <View key={i} style={styles.prepItem}>
                <View style={styles.prepItemIcon}>
                  <Ionicons name={step.icon as any} size={13} color="rgba(255,255,255,0.45)" />
                </View>
                <Text style={styles.prepItemText}>{step.text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Mini Timeline */}
        <Animated.View style={Anim(3)}>
          <Text style={styles.timelineTitle}>Timeline Preview</Text>
          <View style={styles.miniTimeline}>
            <View style={styles.mtLine} />
            <View style={styles.mtItem}>
              <Text style={styles.mtTime}>Now</Text>
              <View style={[styles.mtDot, styles.mtDotInactive]} />
              <Text style={styles.mtLabel}>Free Time</Text>
            </View>
            <View style={styles.mtItem}>
              <Text style={[styles.mtTime, styles.mtTimeActive]}>
                {nextTask?.start_time
                  ? new Date(nextTask.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  : '14:00'}
              </Text>
              <View style={[styles.mtDot, styles.mtDotActive]} />
              <View style={styles.mtActiveBlock}>
                <Text style={styles.mtActiveTitle}>{nextTask?.title || 'Focus Block'}</Text>
                <Text style={styles.mtActiveDuration}>{nextTask?.duration_minutes || 35}m block</Text>
              </View>
            </View>
            <View style={styles.mtItem}>
              <Text style={styles.mtTime}>After</Text>
              <View style={[styles.mtDot, styles.mtDotInactive]} />
              <Text style={styles.mtLabel}>Next activity</Text>
            </View>
          </View>
        </Animated.View>

        {/* Action Controls */}
        <Animated.View style={[styles.actionsWrap, Anim(3)]}>
          <TouchableOpacity
            style={styles.startNowBtn}
            onPress={() => { router.back(); router.push('/focus'); }}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.startNowText}>Start Focus Now</Text>
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            {['notifications-off-outline', 'options-outline', 'checkmark-outline'].map((icon, i) => (
              <TouchableOpacity key={i} style={styles.secBtn} activeOpacity={0.75}>
                <Ionicons name={icon as any} size={16} color="rgba(255,255,255,0.5)" />
                <Text style={styles.secBtnText}>
                  {['Snooze 5m', 'Adjust Plan', 'Mark Done'][i]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F1D' },
  glow: {
    position: 'absolute', top: -100, left: 0, right: 0, height: 400,
    borderRadius: 300, backgroundColor: 'rgba(0,212,255,0.07)',
  },
  dotGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 8,
    maxWidth: 420, alignSelf: 'center', width: '100%',
  },
  closeBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  alertBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(0,212,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
  },
  alertDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#00D4FF' },
  alertBadgeText: { fontSize: 12, fontWeight: '700', color: '#00D4FF', letterSpacing: 0.5 },
  content: { maxWidth: 420, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingBottom: 60, gap: 16 },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)',
    borderRadius: 28, padding: 28, alignItems: 'center', overflow: 'hidden',
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.08, shadowRadius: 20,
  },
  heroGlow: {
    position: 'absolute', top: -30, width: 200, height: 100, borderRadius: 100,
    backgroundColor: 'rgba(0,212,255,0.12)',
  },
  nextUpLabel: { fontSize: 14, color: 'rgba(255,255,255,0.55)', fontWeight: '500', marginBottom: 8 },
  countdown: { fontSize: 60, fontWeight: '800', color: '#fff', letterSpacing: -2 },
  countdownSmall: { fontSize: 28, color: 'rgba(255,255,255,0.45)', fontWeight: '400' },
  heroDivider: { width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 20 },
  heroTask: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 6 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  insightCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 18, padding: 14,
  },
  insightIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  insightText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 19 },
  insightBold: { fontWeight: '700', color: '#fff' },
  prepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  prepTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  prepList: { gap: 8 },
  prepItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, padding: 12,
  },
  prepItemIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  prepItemText: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  timelineTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 12 },
  miniTimeline: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 22, padding: 18, position: 'relative',
  },
  mtLine: {
    position: 'absolute', left: 18 + 40, top: 28, bottom: 28,
    width: 1, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  mtItem: { flexDirection: 'row', alignItems: 'center', gap: 0, marginBottom: 20 },
  mtTime: { width: 40, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  mtTimeActive: { color: '#00D4FF', fontWeight: '700' },
  mtDot: { width: 12, height: 12, borderRadius: 6, marginHorizontal: 8, borderWidth: 2, borderColor: '#0A0F1D' },
  mtDotInactive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  mtDotActive: {
    backgroundColor: '#00D4FF',
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6,
  },
  mtLabel: { fontSize: 13, color: 'rgba(255,255,255,0.45)' },
  mtActiveBlock: {
    backgroundColor: 'rgba(0,212,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flex: 1,
  },
  mtActiveTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  mtActiveDuration: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  actionsWrap: { gap: 12 },
  startNowBtn: {
    backgroundColor: '#00D4FF', borderRadius: 22, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  startNowText: { fontSize: 17, fontWeight: '700', color: '#0A0F1D' },
  secondaryActions: { flexDirection: 'row', gap: 10 },
  secBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 16, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  secBtnText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
});
