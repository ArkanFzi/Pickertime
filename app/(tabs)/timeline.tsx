import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Task } from '@/store/useStore';

const CATEGORY_COLORS: Record<string, string> = {
  Work: '#00D4FF',
  Study: '#A78BFA',
  Health: '#34D399',
  Personal: '#F59E0B',
  Creative: '#F87171',
  School: '#60A5FA',
  General: '#9CA3AF',
};

const FILTERS = ['All Tasks', 'Work', 'Study', 'Personal', 'Health'];

// Mock timeline for demo when no tasks
const MOCK_TIMELINE: Array<{
  time: string;
  type: 'task' | 'free' | 'done';
  task?: { title: string; timeLabel: string; priority?: string; category?: string };
  duration?: string;
}> = [
  { time: '09:00', type: 'done', task: { title: 'Morning Review', timeLabel: '09:00 – 09:30', category: 'Work' } },
  { time: '10:00', type: 'task', task: { title: 'Deep Work Block', timeLabel: '10:00 – 12:00 (2h)', priority: 'High', category: 'Work' } },
  { time: '12:00', type: 'free', duration: '1h 30m' },
  { time: '13:30', type: 'task', task: { title: 'Team Sync', timeLabel: '13:30 – 14:30', category: 'Work' } },
  { time: '15:00', type: 'free', duration: '1h' },
  { time: '16:00', type: 'task', task: { title: 'Strategy Review', timeLabel: '16:00 – 17:30', priority: 'Medium', category: 'Work' } },
];

function TimelineTask({ item, onPress }: { item: typeof MOCK_TIMELINE[0]; onPress?: () => void }) {
  const color = CATEGORY_COLORS[item.task?.category || 'General'];

  if (item.type === 'done') {
    return (
      <View style={[styles.slotRow, styles.slotRowSm]}>
        <Text style={styles.timeLabel}>{item.time}</Text>
        <View style={styles.taskLine} />
        <View style={[styles.taskCard, styles.taskCardDone]}>
          <Ionicons name="checkmark-circle" size={16} color="rgba(52, 211, 153, 0.6)" style={{ alignSelf: 'flex-end' }} />
          <Text style={styles.taskTitleDone}>{item.task?.title}</Text>
          <Text style={styles.taskTime}>{item.task?.timeLabel}</Text>
        </View>
      </View>
    );
  }

  if (item.type === 'free') {
    return (
      <View style={[styles.slotRow, styles.slotRowMd]}>
        <Text style={styles.timeLabel}>{item.time}</Text>
        <View style={styles.taskLine} />
        <TouchableOpacity style={styles.freeSlot} onPress={onPress} activeOpacity={0.7}>
          <Text style={styles.freeSlotLabel}>Free Slot • {item.duration}</Text>
          <View style={styles.freeSlotAdd}>
            <Ionicons name="add" size={16} color="#0A0F1D" />
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.slotRow, styles.slotRowLg]}>
      <Text style={[styles.timeLabel, styles.timeLabelBold]}>{item.time}</Text>
      <View style={styles.taskLine} />
      <View style={styles.taskCardWrap}>
        <View style={[styles.taskCard, styles.taskCardActive]}>
          <View style={[styles.accentBar, { backgroundColor: color }]} />
          <View style={styles.taskCardInner}>
            {item.task?.priority && (
              <View style={[styles.priorityBadge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
                <Text style={[styles.priorityText, { color }]}>{item.task.priority}</Text>
              </View>
            )}
            <Text style={styles.taskTitle}>{item.task?.title}</Text>
            <View style={styles.taskMeta}>
              <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.45)" />
              <Text style={styles.taskTime}>{item.task?.timeLabel}</Text>
            </View>
          </View>
        </View>
        {/* Smart Alarm chip */}
        <View style={styles.alarmChip}>
          <Ionicons name="notifications-outline" size={11} color="#00D4FF" />
          <Text style={styles.alarmChipText}>Smart Alarm set · 10 min before</Text>
          <Ionicons name="chevron-forward" size={11} color="rgba(255,255,255,0.3)" />
        </View>
      </View>
    </View>
  );
}

export default function TimelineScreen() {
  const router = useRouter();
  const { tasks, user } = useStore();
  const [filter, setFilter] = useState('All Tasks');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
  const currentHour = today.getHours();
  const currentMinute = today.getMinutes();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const displayTimeline: typeof MOCK_TIMELINE =
    tasks.length > 0
      ? tasks.map((t) => ({
          time: t.start_time ? new Date(t.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--',
          type: t.is_completed ? 'done' : 'task',
          task: {
            title: t.title,
            timeLabel: `${t.duration_minutes}m`,
            priority: t.priority,
            category: t.category,
          },
        }))
      : MOCK_TIMELINE;

  const freeSlots = displayTimeline.filter((d) => d.type === 'free').length;

  return (
    <View style={styles.container}>
      <View style={styles.glow} />
      <View style={styles.dotGrid} />

      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <View>
          <Text style={styles.pageTitle}>Today's Plan</Text>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.7)" />
            <View style={styles.notifDot} />
          </TouchableOpacity>
          <View style={styles.avatar}>
            <Ionicons name="person" size={18} color="rgba(255,255,255,0.6)" />
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Filter Strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterStrip}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Free Slots Summary */}
        {freeSlots > 0 && (
          <View style={styles.freeSlotsCard}>
            <View style={styles.freeSlotsLeft}>
              <Animated.View style={[styles.freeSlotsIcon, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="flash" size={13} color="#00D4FF" />
              </Animated.View>
              <View>
                <Text style={styles.freeSlotsTitle}>{freeSlots} Free Slot{freeSlots > 1 ? 's' : ''} Available</Text>
                <Text style={styles.freeSlotsSub}>Take advantage of open focus time</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.jumpBtn}>
              <Text style={styles.jumpBtnText}>Jump to Next</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Timeline */}
        <View style={styles.timeline}>
          {/* Vertical Line */}
          <View style={styles.timelineLine} />

          {/* Current Time Indicator */}
          <View style={[styles.currentTimeLine, { top: currentHour * 60 + currentMinute - 120 }]}>
            <View style={styles.currentTimeDot} />
            <Text style={styles.currentTimeLabel}>{`${String(currentHour).padStart(2,'0')}:${String(currentMinute).padStart(2,'0')}`}</Text>
          </View>

          {displayTimeline.map((item, i) => (
            <TimelineTask
              key={i}
              item={item}
              onPress={() => router.push('/schedule')}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F1D' },
  glow: {
    position: 'absolute', top: -100, left: 0, right: 0, height: 350,
    borderRadius: 300, backgroundColor: 'rgba(0,212,255,0.05)',
  },
  dotGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1 },
  stickyHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    backgroundColor: 'rgba(10,15,29,0.92)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    maxWidth: 420, alignSelf: 'center', width: '100%',
  },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.8 },
  dateText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2, fontWeight: '500' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#00D4FF',
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { maxWidth: 420, alignSelf: 'center', width: '100%', paddingBottom: 120 },
  filterStrip: { paddingHorizontal: 20, paddingVertical: 14, flexGrow: 0 },
  filterChip: {
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  filterChipActive: { backgroundColor: '#fff' },
  filterText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  filterTextActive: { color: '#0A0F1D' },
  freeSlotsCard: {
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)',
    borderRadius: 20, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  freeSlotsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  freeSlotsIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,212,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  freeSlotsTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  freeSlotsSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  jumpBtn: {
    backgroundColor: 'rgba(0,212,255,0.12)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  jumpBtnText: { fontSize: 11, fontWeight: '700', color: '#00D4FF' },
  timeline: { paddingHorizontal: 20, position: 'relative', paddingBottom: 40 },
  timelineLine: {
    position: 'absolute', left: 20 + 52, top: 0, bottom: 0,
    width: 1, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  currentTimeLine: {
    position: 'absolute', left: 20 + 52, right: 20,
    height: 2, backgroundColor: '#00D4FF',
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6,
    zIndex: 10,
  },
  currentTimeDot: {
    position: 'absolute', left: -5, top: -4,
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#00D4FF',
  },
  currentTimeLabel: {
    position: 'absolute', left: -58, top: -9,
    fontSize: 10, fontWeight: '700', color: '#00D4FF',
  },
  slotRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
  slotRowSm: { minHeight: 64 },
  slotRowMd: { minHeight: 84 },
  slotRowLg: { minHeight: 120 },
  timeLabel: { width: 52, fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: '500', paddingTop: 10, textAlign: 'right', paddingRight: 12 },
  timeLabelBold: { color: '#fff', fontWeight: '700' },
  taskLine: { width: 1 },
  taskCardWrap: { flex: 1, paddingLeft: 14, gap: 8 },
  taskCard: {
    borderRadius: 20, borderWidth: 1, overflow: 'hidden',
  },
  taskCardDone: {
    flex: 1, marginLeft: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14, opacity: 0.55,
  },
  taskCardActive: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  taskCardInner: { padding: 14, paddingLeft: 18 },
  priorityBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, marginBottom: 8,
  },
  priorityText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  taskTitleDone: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)', textDecorationLine: 'line-through' },
  taskTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 8 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  taskTime: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  alarmChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(0,212,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)',
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
  },
  alarmChipText: { flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  freeSlot: {
    flex: 1, marginLeft: 14,
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.4)',
    borderStyle: 'dashed', borderRadius: 20,
    backgroundColor: 'rgba(0,212,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 12, paddingVertical: 18,
  },
  freeSlotLabel: { fontSize: 11, fontWeight: '700', color: '#00D4FF', letterSpacing: 0.5, textTransform: 'uppercase' },
  freeSlotAdd: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#00D4FF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
});
