import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Animated, PanResponder, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, G, Line } from 'react-native-svg';
import { useStore } from '@/store/useStore';
// pb & scheduleTaskNotification kini dikelola di dalam syncAddTask (useStore)

const CATEGORIES = [

  { id: 'Work', color: '#00D4FF' },
  { id: 'Study', color: '#A78BFA' },
  { id: 'Health', color: '#34D399' },
  { id: 'Personal', color: '#F59E0B' },
  { id: 'Creative', color: '#F87171' },
];

const PRIORITIES = ['High', 'Medium', 'Low'];

const SUGGESTIONS: Record<string, string[]> = {
  Student: ['Chapter review', 'Practice problems', 'Assignment writing', 'Lab report'],
  Professional: ['Q3 strategy doc', 'Client proposal', 'Sprint planning', 'Code review'],
  Freelancer: ['Client deliverable', 'Invoice creation', 'Portfolio update'],
  Creator: ['Script writing', 'Video editing', 'Content calendar'],
  Researcher: ['Literature review', 'Data analysis', 'Paper draft'],
};

function RadialTimePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const size = 220;
  const center = size / 2;
  const radius = size / 2 - 20;
  const maxMin = 240; // max 4h
  const angleDeg = (value / maxMin) * 360;
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  const handleX = center + radius * Math.cos(angleRad);
  const handleY = center + radius * Math.sin(angleRad);
  const largeArc = angleDeg > 180 ? 1 : 0;
  const arcEndX = center + radius * Math.cos(((angleDeg - 90) * Math.PI) / 180);
  const arcEndY = center + radius * Math.sin(((angleDeg - 90) * Math.PI) / 180);

  const panRef = useRef<any>(null);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (evt) => {
      const touch = evt.nativeEvent;
      const dx = touch.locationX - center;
      const dy = touch.locationY - center;
      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;
      const newValue = Math.round((angle / 360) * maxMin);
      onChange(Math.max(15, Math.min(maxMin, newValue)));
    },
  });

  const startX = center;
  const startY = center - radius;

  return (
    <View {...panResponder.panHandlers} style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle cx={center} cy={center} r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth={14} fill="transparent" />
        {/* Progress arc */}
        {angleDeg > 5 && (
          <Path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${arcEndX} ${arcEndY}`}
            stroke="#00D4FF"
            strokeWidth={14}
            fill="transparent"
            strokeLinecap="round"
          />
        )}
        {/* Handle dot */}
        <Circle cx={handleX} cy={handleY} r={10} fill="#00D4FF" />
        <Circle cx={handleX} cy={handleY} r={6} fill="#0A0F1D" />
      </Svg>
      {/* Center display */}
      <View style={StyleSheet.absoluteFillObject}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 36, fontWeight: '800', color: '#fff' }}>
            {value}<Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', fontWeight: '400' }}>m</Text>
          </Text>
          <Text style={{ fontSize: 12, color: '#00D4FF', fontWeight: '600', marginTop: 2 }}>Duration</Text>
        </View>
      </View>
    </View>
  );
}

export default function ScheduleScreen() {
  const router = useRouter();
  // ✅ Gunakan syncAddTask — operasi API + state dikelola terpusat di store
  const { user, profile, tasks, syncAddTask, setActiveTask } = useStore();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Work');
  const [priority, setPriority] = useState('High');
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [conflictTask, setConflictTask] = useState<any>(null);
  const [nextSlot, setNextSlot] = useState<{ start: Date; end: Date } | null>(null);

  const suggestions = SUGGESTIONS[profile?.role || 'Professional'];


  const now = new Date();
  const startH = now.getHours();
  const startM = Math.round(now.getMinutes() / 15) * 15;
  const startTimeStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
  const endH = startH + Math.floor((startM + duration) / 60);
  const endM = (startM + duration) % 60;
  const endTimeStr = `${String(endH % 24).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

  // Conflict Detection Effect
  useEffect(() => {
    checkConflicts();
    findNextAvailableSlot();
  }, [duration, tasks]);

  function checkConflicts() {
    const startDt = new Date();
    startDt.setSeconds(0, 0);
    const endDt = new Date(startDt.getTime() + duration * 60000);

    const conflict = tasks.find(t => {
      if (t.is_completed || !t.start_time || !t.end_time) return false;
      const ts = new Date(t.start_time);
      const te = new Date(t.end_time);
      // Overlap logic: (StartA < EndB) and (EndA > StartB)
      return (startDt < te) && (endDt > ts);
    });
    setConflictTask(conflict || null);
  }

  function findNextAvailableSlot() {
    // Collect all future non-completed tasks sorted
    const sorted = tasks
      .filter(t => !t.is_completed && t.start_time && new Date(t.end_time!) > now)
      .sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime());

    let proposedStart = new Date(now);
    proposedStart.setSeconds(0, 0);
    
    // Find first gap wide enough
    for (const t of sorted) {
      const ts = new Date(t.start_time!);
      const te = new Date(t.end_time!);
      
      const gapMins = (ts.getTime() - proposedStart.getTime()) / 60000;
      if (gapMins >= duration) {
        break; // Found it!
      }
      proposedStart = te > proposedStart ? te : proposedStart;
    }

    setNextSlot({
      start: proposedStart,
      end: new Date(proposedStart.getTime() + duration * 60000)
    });
  }


  async function handleSave(startNow: boolean) {
    if (!title.trim()) {
      Alert.alert('Task name required', 'Please enter a task name.');
      return;
    }
    if (!user) {
      Alert.alert('Not signed in');
      return;
    }

    setLoading(true);
    const startDt = new Date();
    const endDt = new Date(startDt.getTime() + duration * 60000);

    try {
      // ✅ syncAddTask menangani: PocketBase create + addTask state + scheduleNotification
      const newTask = await syncAddTask({
        user: user.id,
        title: title.trim(),
        category,
        priority: priority as 'High' | 'Medium' | 'Low',
        duration_minutes: duration,
        start_time: startDt.toISOString(),
        end_time: endDt.toISOString(),
        is_completed: false,
        has_alarm: true,
        alarm_minutes_before: 10,
      });

      if (startNow) {
        setActiveTask(newTask);
        router.push('/focus');
      } else {
        Alert.alert('✅ Tersimpan', 'Tugas ditambahkan ke timeline Anda.');
        setTitle('');
        router.push('/(tabs)/timeline');
      }
    } catch (error: any) {
      Alert.alert('Gagal Menyimpan', error.message || 'Tidak dapat menyimpan tugas. Periksa koneksi internet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Create Task</Text>
        </View>

        {/* Task Input */}
        <View style={styles.inputCard}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What do you need to focus on?"
            placeholderTextColor="rgba(255,255,255,0.25)"
            style={styles.mainInput}
            multiline
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestScroll}>
            {suggestions.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setTitle(s)}
                style={[styles.suggestionChip, title === s && styles.suggestionChipActive]}
              >
                <Text style={[styles.suggestionText, title === s && styles.suggestionTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Priority + Category */}
        <View style={styles.metaRow}>
          <View style={styles.metaCard}>
            <Ionicons name="flag-outline" size={14} color="#00D4FF" />
            <Text style={styles.metaLabel}>Priority</Text>
            <TouchableOpacity
              onPress={() => {
                const idx = PRIORITIES.indexOf(priority);
                setPriority(PRIORITIES[(idx + 1) % PRIORITIES.length]);
              }}
            >
              <Text style={styles.metaValue}>{priority}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.metaCard}>
            <Ionicons name="grid-outline" size={14} color="#00D4FF" />
            <Text style={styles.metaLabel}>Category</Text>
            <Text style={styles.metaValue}>{category}</Text>
          </View>
        </View>

        {/* Category Chips */}
        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setCategory(c.id)}
              style={[styles.catChip, category === c.id && { borderColor: c.color, backgroundColor: `${c.color}18` }]}
            >
              <View style={[styles.catDot, { backgroundColor: c.color }]} />
              <Text style={[styles.catText, category === c.id && { color: c.color }]}>{c.id}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Radial Time Picker */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>DURATION & TIME</Text>
        </View>

        <View style={styles.dialContainer}>
          <RadialTimePicker value={duration} onChange={setDuration} />
        </View>

        <View style={styles.timeRange}>
          <View style={styles.timeItem}>
            <Text style={styles.timeItemLabel}>Start Time</Text>
            <Text style={styles.timeItemValue}>{startTimeStr}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.2)" />
          <View style={styles.timeItem}>
            <Text style={styles.timeItemLabel}>End Time</Text>
            <Text style={styles.timeItemValue}>{endTimeStr}</Text>
          </View>
        </View>

        {/* Conflict Warning */}
        {conflictTask && (
          <View style={styles.conflictBanner}>
            <Ionicons name="alert-circle" size={16} color="#F87171" />
            <Text style={styles.conflictBannerText}>
              Overlaps with: <Text style={{fontWeight:'700'}}>{conflictTask.title}</Text>
            </Text>
          </View>
        )}


        {/* Smart Recommendation */}
        <View style={[styles.smartCard, conflictTask && { borderColor: 'rgba(248, 113, 113, 0.3)' }]}>
          <View style={styles.smartGlow} />
          <View style={styles.smartTop}>
            <View>
              <View style={styles.smartTitleRow}>
                <Ionicons name={conflictTask ? "alert-circle" : "flash"} size={13} color={conflictTask ? "#F87171" : "#00D4FF"} />
                <Text style={styles.smartTitle}>{conflictTask ? "Schedule Busy" : "Best Energy Match"}</Text>
              </View>
              <Text style={styles.smartDesc}>
                {conflictTask ? "The current slot is occupied." : "Aligns perfectly with your peak focus window."}
              </Text>
            </View>
            <View style={[styles.matchBadge, conflictTask && { backgroundColor: 'rgba(248, 113, 113, 0.15)', borderColor: 'rgba(248, 113, 113, 0.3)' }]}>
              <Text style={[styles.matchText, conflictTask && { color: '#F87171' }]}>
                {conflictTask ? "Busy" : "98% Match"}
              </Text>
            </View>
          </View>
          {nextSlot && (
            <View style={styles.smartSlot}>
              <View>
                <Text style={styles.smartSlotTime}>
                  {nextSlot.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – 
                  {nextSlot.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={[styles.smartSlotSub, conflictTask && { color: '#F87171' }]}>
                  {conflictTask ? "Next Available Slot" : "Auto-calculated Optima"}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.smartApplyBtn}
                onPress={() => {
                   // This is complex because date is current. 
                   // For now, we'll just show it.
                   Alert.alert('Apply Suggested Slot', 'Coming soon: Automatically shifting start time.');
                }}
              >
                <Ionicons name="sparkles" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
          )}
        </View>


        {/* Actions */}
        <TouchableOpacity 
          style={[styles.primaryBtn, conflictTask && { backgroundColor: '#F87171' }]} 
          onPress={() => handleSave(true)} 
          disabled={loading} 
          activeOpacity={0.85}
        >
          <Ionicons name={conflictTask ? "warning" : "play"} size={14} color="#0A0F1D" />
          <Text style={styles.primaryBtnText}>
            {conflictTask ? "Save Anyway" : "Save & Start Focus"}
          </Text>
        </TouchableOpacity>


        <TouchableOpacity style={styles.ghostBtn} onPress={() => handleSave(false)} disabled={loading} activeOpacity={0.8}>
          <Text style={styles.ghostBtnText}>Save for Later</Text>
        </TouchableOpacity>
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
  content: { maxWidth: 420, alignSelf: 'center', width: '100%', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 100 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.8 },
  inputCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 24, padding: 18, marginBottom: 14,
  },
  mainInput: { fontSize: 17, color: '#fff', fontWeight: '500', marginBottom: 14, minHeight: 50 },
  suggestScroll: { marginHorizontal: -4 },
  suggestionChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  suggestionChipActive: {
    backgroundColor: 'rgba(0,212,255,0.12)', borderColor: 'rgba(0,212,255,0.35)',
  },
  suggestionText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  suggestionTextActive: { color: '#00D4FF' },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  metaCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 18, padding: 14, justifyContent: 'space-between',
  },
  metaLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', flex: 1 },
  metaValue: { fontSize: 13, fontWeight: '700', color: '#fff' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  catText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  sectionHeader: { marginBottom: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
  dialContainer: { alignItems: 'center', marginBottom: 20 },
  timeRange: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18, padding: 16, marginBottom: 20,
  },
  timeItem: { alignItems: 'center', gap: 4 },
  timeItemLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  timeItemValue: { fontSize: 15, fontWeight: '700', color: '#fff' },
  smartCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
    borderRadius: 24, padding: 18, marginBottom: 20, overflow: 'hidden',
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.06, shadowRadius: 15,
  },
  smartGlow: {
    position: 'absolute', top: -30, right: -30, width: 100, height: 100,
    borderRadius: 50, backgroundColor: 'rgba(0,212,255,0.08)',
  },
  smartTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  smartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  smartTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  smartDesc: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  matchBadge: {
    backgroundColor: 'rgba(0,212,255,0.15)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)',
  },
  matchText: { fontSize: 11, fontWeight: '700', color: '#00D4FF' },
  smartSlot: {
    backgroundColor: 'rgba(10,15,29,0.6)', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  smartSlotTime: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 3 },
  smartSlotSub: { fontSize: 11, color: '#00D4FF' },
  smartApplyBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: '#00D4FF', borderRadius: 18, paddingVertical: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8, marginBottom: 12,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0F1D' },
  ghostBtn: {
    paddingVertical: 16, borderRadius: 18, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  ghostBtnText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  conflictBanner: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)', 
    borderWidth: 1, borderColor: 'rgba(248, 113, 113, 0.25)',
    borderRadius: 16, padding: 12, marginBottom: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  conflictBannerText: { fontSize: 13, color: '#F87171', fontWeight: '500' },
});

