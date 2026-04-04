import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/store/useStore';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (user) {
      router.replace('/');
      return;
    }

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse1, { toValue: 1.15, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulse1, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse2, { toValue: 1.25, duration: 2500, useNativeDriver: true }),
        Animated.timing(pulse2, { toValue: 1, duration: 2500, useNativeDriver: true }),
      ])
    ).start();
  }, [user]);

  return (
    <View style={styles.container}>
      {/* Animated Glow Orbs */}
      <Animated.View style={[styles.glowOrb1, { transform: [{ scale: pulse1 }] }]} />
      <Animated.View style={[styles.glowOrb2, { transform: [{ scale: pulse2 }] }]} />

      {/* Dot Pattern Overlay */}
      <View style={styles.dotPattern} />

      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {/* Logo Mark */}
        <View style={styles.logoContainer}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Ionicons name="time" size={32} color="#00D4FF" />
            </View>
          </View>
          <View style={styles.logoPulse} />
        </View>

        {/* Headline */}
        <View style={styles.textBlock}>
          <Text style={styles.headline}>Pickertime</Text>
          <Text style={styles.tagline}>Your Intelligent{'\n'}Focus Operating System</Text>
          <Text style={styles.sub}>
            Context-aware scheduling. Deep focus protection. Built around how you actually work.
          </Text>
        </View>

        {/* Feature Pills */}
        <View style={styles.pillRow}>
          {['🧠 AI Scheduling', '⚡ Smart Alarms', '🎯 Deep Focus'].map((pill) => (
            <View key={pill} style={styles.pill}>
              <Text style={styles.pillText}>{pill}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/(auth)/sign-up')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={18} color="#0A0F1D" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => router.push('/(auth)/sign-in')}
            activeOpacity={0.75}
          >
            <Text style={styles.ghostBtnText}>Sign In to Existing Account</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowOrb1: {
    position: 'absolute',
    top: -100,
    left: width / 2 - 200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(0, 212, 255, 0.08)',
  },
  glowOrb2: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(0, 212, 255, 0.05)',
  },
  dotPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.15,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 28,
    paddingTop: 100,
    paddingBottom: 48,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  logoInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 212, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPulse: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.15)',
  },
  textBlock: {
    marginBottom: 28,
  },
  headline: {
    fontSize: 42,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1.5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '600',
    color: '#00D4FF',
    lineHeight: 28,
    marginBottom: 14,
  },
  sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 22,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 40,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 212, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: '#00D4FF',
    borderRadius: 18,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0F1D',
  },
  ghostBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  ghostBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
});
