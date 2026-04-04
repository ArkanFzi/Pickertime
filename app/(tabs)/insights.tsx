import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';
import { getAIInsight } from '@/lib/gemini';

const { width } = Dimensions.get('window');

const HEATMAP_DATA = {
  Morning:   [2, 4, 3, 4, 2, 0, 1],
  Afternoon: [3, 2, 2, 1, 3, 1, 2],
  Evening:   [0, 1, 0, 2, 0, 0, 1],
};

const HEAT_COLORS = [
  'rgba(255,255,255,0.05)',
  'rgba(0,212,255,0.22)',
  'rgba(0,212,255,0.50)',
  'rgba(0,212,255,0.78)',
  'rgba(0,212,255,1.0)',
];

const AI_SUGGESTIONS: Record<string, string> = {
  Student: 'Your completion rate for homework tasks drops 40% after 6PM. Move coding blocks to your morning peak.',
  Professional: 'You have 3 recurring meetings that fragment your deep work. Consider batching them on Tuesday afternoons.',
  Freelancer: 'Client proposal tasks have the highest completion rate on Monday mornings. Schedule deliverables then.',
  Creator: 'Your creative output peaks between 9–11AM. Protect this window ruthlessly.',
  Researcher: 'Literature review sessions are most productive in 90-min blocks. Avoid back-to-back scheduling.',
};

const WEEK_FOCUS = [180, 240, 150, 300, 210, 90, 120];
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function InsightsScreen() {
  const { profile, user } = useStore();
  const role = profile?.role || 'Professional';
  const suggestion = AI_SUGGESTIONS[role] || AI_SUGGESTIONS['Professional'];

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const totalFocusMins = WEEK_FOCUS.reduce((a, b) => a + b, 0);
  const completionRate = 84;

  const slideAnims = useRef(
    [0, 1, 2, 3, 4].map(() => new Animated.Value(30))
  ).current;
  const fadeAnims = useRef(
    [0, 1, 2, 3, 4].map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    slideAnims.forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(i * 100),
        Animated.parallel([
          Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.timing(fadeAnims[i], { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ]).start();
    });

    fetchInsight();
  }, []);

  async function fetchInsight() {
    if (!profile) return;
    setLoadingAI(true);
    const insight = await getAIInsight(
      profile.role || 'Professional',
      profile.focus_goal || 'Productivity',
      {} // Pass actual focus data here in future
    );
    setAiInsight(insight);
    setLoadingAI(false);
  }

  function Animated_(index: number) {
    return {
      transform: [{ translateY: slideAnims[index] }],
      opacity: fadeAnims[index],
    };
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />
      <View style={styles.dotGrid} />

      {/* Header */}
      <View style={styles.stickyHeader}>
        <View>
          <Text style={styles.pageTitle}>Weekly Insights</Text>
          <Text style={styles.weekRange}>{getWeekRange()}</Text>
        </View>
        <TouchableOpacity style={styles.calBtn}>
          <Ionicons name="calendar-outline" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Executive Summary */}
        <Animated.View style={[styles.statsRow, Animated_(0)]}>
          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons name="timer-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.statLabel}>Focus Mins</Text>
            </View>
            <Text style={styles.statValue}>{totalFocusMins.toLocaleString()}</Text>
            <Text style={styles.statTrend}>↑ 12% vs last week</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons name="checkmark-done-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.statLabel}>Completion</Text>
            </View>
            <Text style={styles.statValue}>{completionRate}%</Text>
            <Text style={styles.statSubText}>32/38 blocks</Text>
          </View>
        </Animated.View>

        {/* Focus Trend Chart */}
        <Animated.View style={[styles.chartCard, Animated_(1)]}>
          <View style={styles.chartHeader}>
            <Text style={styles.cardTitle}>Focus Trend</Text>
            <View style={styles.weekBadge}><Text style={styles.weekBadgeText}>This Week</Text></View>
          </View>
          <LineChart
            data={{
              labels: WEEK_LABELS,
              datasets: [{ data: WEEK_FOCUS }],
            }}
            width={Math.min(width - 80, 340)}
            height={160}
            chartConfig={{
              backgroundColor: 'transparent',
              backgroundGradientFrom: 'transparent',
              backgroundGradientTo: 'transparent',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(0, 212, 255, ${opacity})`,
              labelColor: () => 'rgba(255,255,255,0.4)',
              style: { borderRadius: 16 },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
                stroke: '#00D4FF',
                fill: '#0A0F1D',
              },
              propsForBackgroundLines: { stroke: 'rgba(255,255,255,0.04)' },
            }}
            bezier
            style={{ marginLeft: -16 }}
            withInnerLines
            withOuterLines={false}
            withShadow={false}
          />
        </Animated.View>

        {/* Heatmap */}
        <Animated.View style={[styles.heatmapCard, Animated_(2)]}>
          <View style={styles.chartHeader}>
            <Text style={styles.cardTitle}>Best Time to Focus</Text>
            <Ionicons name="flame" size={16} color="#00D4FF" />
          </View>
          <Text style={styles.heatmapSub}>
            {profile?.energy_pref === 'Night Owl'
              ? 'You are most productive in the evenings.'
              : profile?.energy_pref === 'Afternoon'
              ? 'You are most productive between 12PM and 5PM.'
              : 'You are most productive between 9AM and 11AM.'}
          </Text>

          <View style={styles.heatGrid}>
            <View style={styles.heatDaysRow}>
              <Text style={styles.heatRowLabel} />
              {['M','T','W','T','F','S','S'].map((d, i) => (
                <Text key={i} style={styles.heatDayLabel}>{d}</Text>
              ))}
            </View>
            {Object.entries(HEATMAP_DATA).map(([period, vals]) => (
              <View key={period} style={styles.heatRow}>
                <Text style={styles.heatRowLabel}>{period.slice(0,3)}</Text>
                {vals.map((v, i) => (
                  <View key={i} style={[styles.heatCell, { backgroundColor: HEAT_COLORS[Math.min(v, 4)] }]} />
                ))}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* AI Suggestion */}
        <Animated.View style={Animated_(3)}>
          <Text style={styles.sectionTitle}>AI Suggestions</Text>
          <View style={styles.suggestionCard}>
            <View style={styles.suggestionGlow} />
            <View style={styles.suggestionRow}>
              <View style={styles.suggestionIcon}>
                <Ionicons name="bulb-outline" size={16} color="#00D4FF" />
              </View>
              <View style={styles.suggestionText}>
                <Text style={styles.suggestionTitle}>
                  {loadingAI ? '🤖 Analyzing Pattern...' : 'Optimize Your Schedule'}
                </Text>
                <Text style={styles.suggestionBody}>
                  {aiInsight || suggestion}
                </Text>
              </View>
            </View>
            <View style={styles.suggestionActions}>
              <TouchableOpacity style={styles.adjustBtn}>
                <Text style={styles.adjustBtnText}>Adjust Schedule</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dismissBtn}>
                <Text style={styles.dismissBtnText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Alarm Effectiveness */}
          <View style={styles.alarmEffCard}>
            <View style={styles.alarmEffLeft}>
              <View style={styles.alarmEffIcon}>
                <Ionicons name="notifications-off-outline" size={16} color="#F87171" />
              </View>
              <View>
                <Text style={styles.alarmEffTitle}>Snooze Rate</Text>
                <Text style={styles.alarmEffSub}>Morning alarms</Text>
              </View>
            </View>
            <View style={styles.alarmEffRight}>
              <Text style={styles.alarmEffValue}>28%</Text>
              <Text style={styles.alarmEffTrend}>High snooze rate</Text>
            </View>
          </View>
        </Animated.View>

        {/* Goals Button */}
        <Animated.View style={Animated_(4)}>
          <TouchableOpacity style={styles.goalsBtn}>
            <View style={styles.goalsBtnLeft}>
              <Ionicons name="options-outline" size={18} color="rgba(255,255,255,0.5)" />
              <Text style={styles.goalsBtnText}>Adjust Goals & Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function getWeekRange(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F1D' },
  glow: {
    position: 'absolute', top: -100, right: -50, width: 350, height: 350,
    borderRadius: 175, backgroundColor: 'rgba(0,212,255,0.06)',
  },
  dotGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1 },
  stickyHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    backgroundColor: 'rgba(10,15,29,0.92)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    maxWidth: 420, alignSelf: 'center', width: '100%',
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.6 },
  weekRange: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  calBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flex: 1 },
  content: {
    maxWidth: 420, alignSelf: 'center', width: '100%',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100, gap: 14,
  },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 22, padding: 16, gap: 4,
  },
  statIcon: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  statLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, textTransform: 'uppercase' },
  statValue: { fontSize: 28, fontWeight: '800', color: '#fff' },
  statTrend: { fontSize: 12, color: '#34D399' },
  statSubText: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  chartCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 22, padding: 16,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  weekBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  weekBadgeText: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  heatmapCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 22, padding: 16,
  },
  heatmapSub: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 14 },
  heatGrid: { gap: 6 },
  heatDaysRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 36 },
  heatDayLabel: { flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heatRowLabel: { width: 36, fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  heatCell: { flex: 1, height: 24, borderRadius: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 10 },
  suggestionCard: {
    backgroundColor: 'rgba(0,212,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)',
    borderRadius: 22, padding: 16, overflow: 'hidden', marginBottom: 12,
  },
  suggestionGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,212,255,0.03)',
  },
  suggestionRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  suggestionIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,212,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  suggestionText: { flex: 1 },
  suggestionTitle: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 4 },
  suggestionBody: { fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 18 },
  suggestionActions: { flexDirection: 'row', gap: 10 },
  adjustBtn: {
    flex: 1, backgroundColor: 'rgba(0,212,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)',
    borderRadius: 14, paddingVertical: 10, alignItems: 'center',
  },
  adjustBtnText: { fontSize: 12, fontWeight: '600', color: '#00D4FF' },
  dismissBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14, paddingVertical: 10, alignItems: 'center',
  },
  dismissBtnText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  alarmEffCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 22, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  alarmEffLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  alarmEffIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  alarmEffTitle: { fontSize: 13, fontWeight: '600', color: '#fff' },
  alarmEffSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  alarmEffRight: { alignItems: 'flex-end' },
  alarmEffValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  alarmEffTrend: { fontSize: 11, color: '#F87171', marginTop: 2 },
  goalsBtn: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 20, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  goalsBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalsBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
