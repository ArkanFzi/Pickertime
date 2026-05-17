import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Animated, PanResponder, Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useStore } from '@/store/useStore';

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
  const maxMin = 240; 
  const angleDeg = (value / maxMin) * 360;
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  const handleX = center + radius * Math.cos(angleRad);
  const handleY = center + radius * Math.sin(angleRad);
  const largeArc = angleDeg > 180 ? 1 : 0;
  const arcEndX = center + radius * Math.cos(((angleDeg - 90) * Math.PI) / 180);
  const arcEndY = center + radius * Math.sin(((angleDeg - 90) * Math.PI) / 180);

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
        <Circle cx={center} cy={center} r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth={14} fill="transparent" />
        {angleDeg > 5 && (
          <Path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${arcEndX} ${arcEndY}`}
            stroke="#00D4FF"
            strokeWidth={14}
            fill="transparent"
            strokeLinecap="round"
          />
        )}
        <Circle cx={handleX} cy={handleY} r={10} fill="#00D4FF" />
        <Circle cx={handleX} cy={handleY} r={6} fill="#0A0F1D" />
      </Svg>
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

export default function EditTaskScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  
  const { user, profile, tasks, syncUpdateTask, syncDeleteTask, setActiveTask } = useStore();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Work');
  const [priority, setPriority] = useState('High');
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [conflictTask, setConflictTask] = useState<any>(null);

  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
    return d;
  });

  const suggestions = SUGGESTIONS[profile?.role || 'Professional'];

  useEffect(() => {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      setTitle(task.title);
      setCategory(task.category);
      setPriority(task.priority);
      setDuration(task.duration_minutes);
      if (task.start_time) {
        setStartTime(new Date(task.start_time));
      }
    }
  }, [id, tasks]);

  const startTimeStr = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const endTime = new Date(startTime.getTime() + duration * 60000);
  const endTimeStr = endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  useEffect(() => {
    checkConflicts();
  }, [duration, tasks, startTime]);

  function checkConflicts() {
    const startDt = startTime;
    const endDt = new Date(startDt.getTime() + duration * 60000);

    const conflict = tasks.find(t => {
      if (t.id === id) return false; // Don't conflict with itself
      if (t.is_completed || !t.start_time || !t.end_time) return false;
      const ts = new Date(t.start_time);
      const te = new Date(t.end_time);
      return (startDt < te) && (endDt > ts);
    });
    setConflictTask(conflict || null);
  }

  async function handleUpdate(startNow: boolean) {
    if (!title.trim()) {
      Alert.alert('Task name required', 'Please enter a task name.');
      return;
    }
    if (!user || !id) return;

    setLoading(true);
    const startDt = startTime;
    const endDt = new Date(startDt.getTime() + duration * 60000);

    try {
      const updatedTask = await syncUpdateTask(id as string, {
        title: title.trim(),
        category,
        priority: priority as 'High' | 'Medium' | 'Low',
        duration_minutes: duration,
        start_time: startDt.toISOString(),
        end_time: endDt.toISOString(),
      });

      if (startNow) {
        setActiveTask(updatedTask);
        router.push('/focus');
      } else {
        Alert.alert('✅ Diperbarui', 'Tugas berhasil diperbarui.');
        router.back();
      }
    } catch (error: any) {
      Alert.alert('Gagal Memperbarui', error.message || 'Tidak dapat memperbarui tugas. Periksa koneksi internet.');
    } finally {
      setLoading(false);
    }
  }

  function handleDelete() {
    Alert.alert('Hapus Tugas', 'Apakah Anda yakin ingin menghapus tugas ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          setLoading(true);
          try {
            await syncDeleteTask(id as string);
            router.back();
          } catch (error: any) {
            Alert.alert('Gagal Menghapus', error.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Task</Text>
          <View style={{ width: 24 }} />
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

        {/* Actions */}
        <TouchableOpacity 
          style={[styles.primaryBtn, conflictTask && { backgroundColor: '#F87171' }]} 
          onPress={() => handleUpdate(true)} 
          disabled={loading} 
          activeOpacity={0.85}
        >
          <Ionicons name={conflictTask ? "warning" : "play"} size={14} color="#0A0F1D" />
          <Text style={styles.primaryBtnText}>
            {conflictTask ? "Save Anyway" : "Save & Start Focus"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ghostBtn} onPress={() => handleUpdate(false)} disabled={loading} activeOpacity={0.8}>
          <Text style={styles.ghostBtnText}>Update Task</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={loading} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={16} color="#F87171" />
          <Text style={styles.deleteBtnText}>Delete Task</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn: { padding: 4 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.8 },
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
    marginBottom: 12,
  },
  ghostBtnText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  deleteBtn: {
    paddingVertical: 16, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderWidth: 1, borderColor: 'rgba(248, 113, 113, 0.25)',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#F87171' },
  conflictBanner: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)', 
    borderWidth: 1, borderColor: 'rgba(248, 113, 113, 0.25)',
    borderRadius: 16, padding: 12, marginBottom: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  conflictBannerText: { fontSize: 13, color: '#F87171', fontWeight: '500' },
});
