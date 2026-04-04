import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';

const TOTAL_SECONDS = 25 * 60; // 25min default Pomodoro

export default function FocusScreen() {
  const router = useRouter();
  const { activeTask, user } = useStore();
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [isRunning, setIsRunning] = useState(true);
  const [shieldOn, setShieldOn] = useState(true);
  const [sessionNum, setSessNum] = useState(2);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breatheAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const size = 280;
  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  const progressPct = timeLeft / TOTAL_SECONDS;
  const strokeOffset = circumference * (1 - progressPct);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1.05, duration: 3000, useNativeDriver: true }),
        Animated.timing(breatheAnim, { toValue: 0.95, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            handleSessionComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  async function handleSessionComplete() {
    if (!user) return;
    await supabase.from('focus_sessions').insert({
      user_id: user.id,
      task_id: activeTask?.id || null,
      duration_seconds: TOTAL_SECONDS,
      completed: true,
    });
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      {/* Breathing Glow */}
      <Animated.View style={[styles.centerGlow, { transform: [{ scale: breatheAnim }] }]} />
      <View style={styles.dotGrid} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={styles.focusBadge}>
          <View style={styles.focusDot} />
          <Text style={styles.focusBadgeText}>Deep Focus</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Task Info */}
      <Animated.View style={[styles.taskInfo, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.sessionBadge}>
          <Text style={styles.sessionBadgeText}>Session {sessionNum} of 4</Text>
        </View>
        <Text style={styles.taskName}>
          {activeTask?.title || 'Deep Work Block'}
        </Text>
        <Text style={styles.taskSub}>Stay focused — no distractions allowed</Text>
      </Animated.View>

      {/* Timer Ring */}
      <Animated.View style={[styles.timerWrap, { opacity: fadeAnim }]}>
        {/* Outer glow ring */}
        <View style={styles.outerGlow} />

        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <Circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={10}
            fill="transparent"
          />
          {/* Progress */}
          <Circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke="#00D4FF"
            strokeWidth={10}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            transform={`rotate(-90, ${size / 2}, ${size / 2})`}
          />
        </Svg>

        {/* Timer display in center */}
        <View style={StyleSheet.absoluteFillObject}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.timerText}>{timeStr}</Text>
            <Text style={styles.timerLabel}>Remaining</Text>
          </View>
        </View>
      </Animated.View>

      {/* Toggle Buttons */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, shieldOn && styles.toggleBtnActive]}
          onPress={() => setShieldOn(!shieldOn)}
          activeOpacity={0.75}
        >
          <Ionicons name="shield-half-outline" size={16} color={shieldOn ? '#00D4FF' : 'rgba(255,255,255,0.5)'} />
          <Text style={[styles.toggleText, shieldOn && styles.toggleTextActive]}>
            {shieldOn ? 'Shield On' : 'Shield Off'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toggleBtn} activeOpacity={0.75}>
          <Ionicons name="headset-outline" size={16} color="rgba(255,255,255,0.5)" />
          <Text style={styles.toggleText}>Brown Noise</Text>
        </TouchableOpacity>
      </View>

      {/* Session Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => setIsRunning(!isRunning)}
          activeOpacity={0.8}
        >
          <View style={styles.controlIcon}>
            <Ionicons name={isRunning ? 'pause' : 'play'} size={22} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={styles.controlLabel}>{isRunning ? 'Pause' : 'Resume'}</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <View style={[styles.controlIcon, styles.stopIcon]}>
            <Ionicons name="stop" size={22} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={[styles.controlLabel, styles.stopLabel]}>End Early</Text>
        </TouchableOpacity>
      </View>

      {/* Micro-break hint */}
      <Text style={styles.microBreak}>
        <Ionicons name="eye-outline" size={11} color="rgba(255,255,255,0.3)" />
        {' '}Look away for 20s every 20 minutes
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F1D', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 0 },
  centerGlow: {
    position: 'absolute', top: '30%', left: '50%',
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(0,212,255,0.08)',
    transform: [{ translateX: -160 }, { translateY: -160 }],
  },
  dotGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1 },
  header: {
    width: '100%', maxWidth: 420, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 12,
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  focusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,212,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
  },
  focusDot: {
    width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#00D4FF',
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },
  focusBadgeText: { fontSize: 12, fontWeight: '700', color: '#00D4FF', letterSpacing: 0.5 },
  taskInfo: { alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  sessionBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  sessionBadgeText: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  taskName: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5, textAlign: 'center' },
  taskSub: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  timerWrap: { position: 'relative', width: 280, height: 280, alignItems: 'center', justifyContent: 'center' },
  outerGlow: {
    position: 'absolute', top: 0, left: 0, width: 280, height: 280, borderRadius: 140,
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 30,
    elevation: 0,
  },
  timerText: { fontSize: 56, fontWeight: '800', color: '#fff', letterSpacing: -2 },
  timerLabel: { fontSize: 13, fontWeight: '600', color: '#00D4FF', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },
  toggleRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 24 },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(0,212,255,0.10)',
    borderColor: 'rgba(0,212,255,0.3)',
  },
  toggleText: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  toggleTextActive: { color: '#00D4FF' },
  controls: {
    width: '100%', maxWidth: 420,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 28, marginHorizontal: 24, overflow: 'hidden',
    alignSelf: 'center',
  },
  divider: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.08)' },
  controlBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18,
  },
  controlIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  stopIcon: { backgroundColor: 'rgba(248,113,113,0.08)' },
  controlLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  stopLabel: { color: '#F87171' },
  microBreak: { fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingBottom: 32 },
});
