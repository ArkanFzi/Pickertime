import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useStore } from '@/store/useStore';
import { pb } from '@/lib/pocketbase';
import { getNextBestAction, GeminiSuggestion } from '@/lib/gemini';

const NEXT_ACTION_BY_ROLE: Record<string, { task: string; desc: string; duration: string; category: string }> = {
  Student: { task: 'Chapter 4 Review', desc: 'Optimal deep study block based on your morning peak energy.', duration: '90 mins', category: 'Study' },
  Professional: { task: 'Q3 Product Strategy', desc: 'Deep work block recommended based on your peak energy window.', duration: '90 mins', category: 'Strategy' },
  Freelancer: { task: 'Client Proposal Draft', desc: 'Prime creative window for focused writing.', duration: '60 mins', category: 'Work' },
  Creator: { task: 'Video Script Review', desc: 'Your engagement data shows peak creativity now.', duration: '45 mins', category: 'Content' },
  Researcher: { task: 'Literature Review', desc: 'Ideal block for deep analytical work.', duration: '120 mins', category: 'Research' },
};

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

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, tasks, setTasks, user } = useStore();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [completedCount, setCompletedCount] = useState(0);

  const [aiSuggestion, setAiSuggestion] = useState<GeminiSuggestion | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const role = profile?.role || 'Professional';
  const fallbackAction = NEXT_ACTION_BY_ROLE[role] || NEXT_ACTION_BY_ROLE['Professional'];
  const nextAction = aiSuggestion || fallbackAction;
  const greeting = getGreeting();
  const energyStatus = getEnergyStatus(profile?.energy_pref || 'Morning');

  const totalTasks = tasks.length || 4;
  const doneCount = tasks.filter((t) => t.is_completed).length || completedCount;
  const progressPct = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 75;

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (circumference * progressPct) / 100;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    if (user) loadTasks();
  }, [user]);

  async function loadTasks() {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    try {
      const records = await pb.collection('Tasks').getFullList({
        filter: `user = "${user.id}" && start_time >= "${today}"`,
        sort: 'start_time',
      });
      
      if (records) {
        setTasks(records as any);
        // Fetch AI Suggestion
        fetchAISuggestion(records);
      }
    } catch (error) {
      console.error('Load tasks error:', error);
    }
  }

  async function fetchAISuggestion(currentTasks: any[]) {
    if (!profile) return;
    setLoadingAI(true);
    const suggestion = await getNextBestAction(
      profile.role || 'Professional',
      profile.focus_goal || 'Productivity',
      profile.energy_pref || 'Morning',
      currentTasks
    );
    setAiSuggestion(suggestion);
    setLoadingAI(false);
  }

  const nextTask = tasks.find((t) => !t.is_completed);

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
              <Text style={styles.greetingSub}>Ready for deep focus?</Text>
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
              {loadingAI ? '🤖 Thinking...' : '⚡ Next Best Action'}
            </Text>
            <Text style={styles.nextActionTitle}>
              {nextTask ? nextTask.title : nextAction.task}
            </Text>
            <Text style={[styles.nextActionDesc, loadingAI && { opacity: 0.5 }]}>
              {nextAction.desc}
            </Text>
            <View style={styles.nextActionMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.metaText}>{nextAction.duration}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="layers-outline" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.metaText}>{nextAction.category}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.startFocusBtn}
              onPress={() => router.push('/focus')}
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
            <View style={styles.halfCard}>
              <View style={styles.upcomingTop}>
                <Text style={styles.halfCardLabel}>UPCOMING</Text>
                <Animated.View style={[styles.bellWrap, { transform: [{ scale: pulseAnim }] }]}>
                  <Ionicons name="notifications" size={12} color="#00D4FF" />
                </Animated.View>
              </View>
              <Text style={styles.upcomingTitle}>
                {nextTask ? nextTask.title : 'Team Sync'}
              </Text>
              <Text style={styles.upcomingTime}>Starts in 45m</Text>
              <View style={styles.progressBar}>
                <View style={styles.progressFill} />
              </View>
            </View>
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
  upcomingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' },
  bellWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,212,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  upcomingTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 12, marginBottom: 4, alignSelf: 'flex-start' },
  upcomingTime: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12, alignSelf: 'flex-start' },
  progressBar: { width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 },
  progressFill: { width: '33%', height: 4, backgroundColor: '#00D4FF', borderRadius: 2 },
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
