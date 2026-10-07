import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useStore, Task } from '@/store/useStore';
import { getNextBestAction, GeminiSuggestion } from '@/lib/gemini';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getEnergyStatus(energyPref: string): string {
  const h = new Date().getHours();
  if (energyPref === 'Morning' && h >= 6 && h < 12) return 'High Energy';
  if (energyPref === 'Afternoon' && h >= 12 && h < 17) return 'High Energy';
  if (energyPref === 'Night Owl' && (h >= 20 || h < 2)) return 'High Energy';
  if (h >= 14 && h < 16) return 'Post-Lunch Dip';
  return 'Building Momentum';
}

function startMsOf(task: Task) {
  return task.start_time ? new Date(task.start_time).getTime() : 0;
}

function endMsOf(task: Task) {
  const start = startMsOf(task);
  return task.end_time ? new Date(task.end_time).getTime() : start + task.duration_minutes * 60000;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, tasks, user, syncFetchTasks, setActiveTask } = useStore();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [now, setNow] = useState(() => new Date());
  const [aiSuggestion, setAiSuggestion] = useState<GeminiSuggestion | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);

  const greeting = getGreeting();
  const energyStatus = getEnergyStatus(profile?.energy_pref || 'Morning');

  const totalTasks = tasks.length;
  const doneCount = tasks.filter((t) => t.is_completed).length;
  const progressPct = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (circumference * progressPct) / 100;

  // Satu kartu = satu sumber data. Dulu judul task nyata ditempel "90 mins · Strategy"
  // dari fallback karangan, sehingga angka palsu terlihat seperti milik user (F-25).
  const pendingTasks = tasks
    .filter((t) => t.start_time && !t.is_completed)
    .sort((a, b) => startMsOf(a) - startMsOf(b));
  const focusTask = pendingTasks[0] ?? null;

  const minutesToStart = focusTask ? Math.round((startMsOf(focusTask) - now.getTime()) / 60000) : 0;
  const isRunningNow = focusTask !== null && startMsOf(focusTask) <= now.getTime() && endMsOf(focusTask) >= now.getTime();
  const isOverdue = focusTask !== null && endMsOf(focusTask) < now.getTime();
  const minutesLate = focusTask ? Math.round((now.getTime() - endMsOf(focusTask)) / 60000) : 0;

  const upcomingLabel = !focusTask
    ? 'Nothing scheduled'
    : isOverdue
      ? `Overdue ${minutesLate}m`
      : isRunningNow
        ? 'In progress'
        : minutesToStart <= 0
          ? 'Starting now'
          : `Starts in ${minutesToStart}m`;

  const upcomingWindow = focusTask ? Math.max(1, endMsOf(focusTask) - startMsOf(focusTask)) : 1;
  const upcomingElapsedPct = focusTask && isRunningNow
    ? Math.min(100, Math.max(0, Math.round(((now.getTime() - startMsOf(focusTask)) / upcomingWindow) * 100)))
    : 0;

  const actionCard = aiSuggestion
    ? { title: aiSuggestion.task, desc: aiSuggestion.desc, duration: aiSuggestion.duration, category: aiSuggestion.category, fromAI: true }
    : focusTask
      ? {
        title: focusTask.title,
        desc: focusTask.description || 'Your next scheduled task today.',
        duration: `${focusTask.duration_minutes} mins`,
        category: focusTask.category,
        fromAI: false,
      }
      : {
        title: 'No tasks yet',
        desc: 'Add your first task to start tracking focus today.',
        duration: '',
        category: '',
        fromAI: false,
      };

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    // Hitung mundur harus bergerak walau tidak ada perubahan data.
    const tick = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (user) {
      loadTasks();
    }
  }, [user]);

  async function loadTasks() {
    if (!user) return;
    await syncFetchTasks();
    fetchAISuggestion(useStore.getState().tasks);
  }

  async function fetchAISuggestion(currentTasks: Task[]) {
    if (!profile) return;
    setLoadingAI(true);
    const suggestion = await getNextBestAction(
      profile.role || 'Professional',
      profile.focus_goal || 'Productivity',
      profile.energy_pref || 'Morning',
      currentTasks
    );
    setAiSuggestion(suggestion);
    setAiFailed(suggestion === null);
    setLoadingAI(false);
  }

  return (
    <View style={styles.container}>
      {/* Ambient Glow */}
      <View style={styles.glow} />
      <View style={styles.dotGrid} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={20} color="rgba(255,255,255,0.6)" />
            </View>
            <View>
              <Text style={styles.greeting}>{greeting}, {profile?.full_name?.split(' ')[0] || 'there'}</Text>
              <Text style={styles.greetingSub}>Your Focus Operating System</Text>
            </View>
          </View>
          <View style={styles.energyBadge}>
            <Ionicons name="flash" size={11} color="#00D4FF" />
            <Text style={styles.energyText}>{energyStatus}</Text>
          </View>
        </View>

        {/* Bento Grid */}
        <View style={styles.bentoGrid}>

          {/* Next Best Action — Full Width */}
          <View style={styles.nextActionCard}>
            <View style={styles.nextActionGlow} />
            <Text style={styles.sectionBadge}>
              {loadingAI ? '🤖 Thinking...' : actionCard.fromAI ? '⚡ AI Suggestion' : '⚡ Next Up'}
            </Text>
            <Text style={styles.nextActionTitle}>
              {actionCard.title}
            </Text>
            <Text style={[styles.nextActionDesc, loadingAI && { opacity: 0.5 }]}>
              {actionCard.desc}
            </Text>
            {(actionCard.duration || actionCard.category) ? (
              <View style={styles.nextActionMeta}>
                {actionCard.duration ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.metaText}>{actionCard.duration}</Text>
                  </View>
                ) : null}
                {actionCard.category ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="layers-outline" size={14} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.metaText}>{actionCard.category}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {aiFailed && !loadingAI ? (
              <Text style={styles.aiNote}>AI is unavailable right now — this card shows your real schedule.</Text>
            ) : null}
            <TouchableOpacity
              style={styles.startFocusBtn}
              onPress={() => {
                if (focusTask) setActiveTask(focusTask);
                router.push('/focus');
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="play" size={14} color="#0A0F1D" />
              <Text style={styles.startFocusBtnText}>Start Focus</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Half-width Row */}
          <View style={styles.halfRow}>
            {/* Daily Progress Ring */}
            <View style={styles.halfCard}>
              <Text style={styles.halfCardLabel}>DAILY PLAN</Text>
              <View style={styles.ringWrap}>
                <Svg width={90} height={90} viewBox="0 0 100 100">
                  <Circle
                    cx="50" cy="50" r={radius}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <Circle
                    cx="50" cy="50" r={radius}
                    stroke="#00D4FF"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                    transform="rotate(-90, 50, 50)"
                  />
                </Svg>
                <View style={styles.ringCenter}>
                  <Text style={styles.ringPct}>{progressPct}%</Text>
                </View>
              </View>
              <Text style={styles.ringSubText}>{doneCount} of {totalTasks} Done</Text>
            </View>

            {/* Upcoming Alarm Tile */}
            <TouchableOpacity 
              style={styles.upcomingCard}
              onPress={() => router.push('/smart-alarm')}
              activeOpacity={0.8}
            >
              <View style={styles.upcomingTopRow}>
                <Text style={styles.upcomingLabel}>UPCOMING</Text>
                <Animated.View style={[styles.bellWrap, { transform: [{ scale: pulseAnim }] }]}>
                  <Ionicons name="notifications" size={12} color="#00D4FF" />
                </Animated.View>
              </View>
              <View>
                <Text style={styles.upcomingTitle} numberOfLines={1}>
                  {focusTask ? focusTask.title : 'No scheduled task'}
                </Text>
                <Text style={styles.upcomingTime}>{upcomingLabel}</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${upcomingElapsedPct}%` }]} />
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Quick Actions */}
          <Text style={styles.quickActionsLabel}>QUICK ACTIONS</Text>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => router.push('/schedule')}
            activeOpacity={0.75}
          >
            <View style={styles.quickActionLeft}>
              <View style={styles.quickIcon}>
                <Ionicons name="add" size={16} color="rgba(255,255,255,0.7)" />
              </View>
              <View>
                <Text style={styles.quickTitle}>Create Task</Text>
                <Text style={styles.quickSub}>Add to today's schedule</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => router.push('/timeline')}
            activeOpacity={0.75}
          >
            <View style={styles.quickActionLeft}>
              <View style={styles.quickIcon}>
                <Ionicons name="list" size={16} color="rgba(255,255,255,0.7)" />
              </View>
              <View>
                <Text style={styles.quickTitle}>View The Plan</Text>
                <Text style={styles.quickSub}>Check timeline view</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => router.push('/smart-alarm')}
            activeOpacity={0.75}
          >
            <View style={styles.quickActionLeft}>
              <View style={styles.quickIcon}>
                <Ionicons name="notifications-outline" size={16} color="rgba(255,255,255,0.7)" />
              </View>
              <View>
                <Text style={styles.quickTitle}>Smart Alert</Text>
                <Text style={styles.quickSub}>Context-aware alarm preview</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>
        </View>
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
  scroll: { flex: 1 },
  scrollContent: {
    maxWidth: 420, alignSelf: 'center', width: '100%',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 100,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  greeting: { fontSize: 14, fontWeight: '600', color: '#fff' },
  greetingSub: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  energyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(0,212,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
  },
  energyText: { fontSize: 11, fontWeight: '700', color: '#00D4FF' },
  bentoGrid: { gap: 12 },
  nextActionCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
    borderRadius: 24, padding: 20, overflow: 'hidden',
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.06, shadowRadius: 20,
  },
  nextActionGlow: {
    position: 'absolute', top: -30, right: -30, width: 120, height: 120,
    borderRadius: 60, backgroundColor: 'rgba(0,212,255,0.10)',
  },
  sectionBadge: { fontSize: 11, fontWeight: '700', color: '#00D4FF', marginBottom: 10, letterSpacing: 0.5 },
  nextActionTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 6 },
  nextActionDesc: { fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 19, marginBottom: 16 },
  aiNote: { fontSize: 11, color: '#F59E0B', lineHeight: 16, marginBottom: 12 },
  nextActionMeta: {
    flexDirection: 'row', gap: 20, marginBottom: 18,
    backgroundColor: 'rgba(10,15,29,0.5)',
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.75)' },
  startFocusBtn: {
    backgroundColor: '#00D4FF', borderRadius: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  startFocusBtnText: { fontSize: 14, fontWeight: '700', color: '#0A0F1D' },
  halfRow: { flexDirection: 'row', gap: 12 },
  halfCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 24, padding: 16, minHeight: 160,
    alignItems: 'center', justifyContent: 'center',
  },
  halfCardLabel: {
    position: 'absolute', top: 14, left: 14,
    fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1,
  },
  ringWrap: { position: 'relative', width: 90, height: 90, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 18, fontWeight: '800', color: '#fff' },
  ringSubText: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 8, textAlign: 'center' },
  upcomingCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 24, padding: 18, minHeight: 160,
    justifyContent: 'space-between',
  },
  upcomingTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%',
  },
  upcomingLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2,
  },
  bellWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,212,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  upcomingTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 12, marginBottom: 4 },
  upcomingTime: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 },
  progressBar: { width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 },
  progressFill: { width: '0%', height: 4, backgroundColor: '#00D4FF', borderRadius: 2 },
  quickActionsLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5, marginTop: 4, marginLeft: 4,
  },
  quickActionItem: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  quickActionLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  quickIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  quickTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  quickSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
});
