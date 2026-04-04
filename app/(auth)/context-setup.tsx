import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

const ROLES = [
  { id: 'Student', icon: 'school-outline', label: 'Student', desc: 'Classes, assignments & exams' },
  { id: 'Professional', icon: 'briefcase-outline', label: 'Professional', desc: 'Meetings, deadlines & sprints' },
  { id: 'Freelancer', icon: 'laptop-outline', label: 'Freelancer', desc: 'Clients, projects & billing' },
  { id: 'Creator', icon: 'color-palette-outline', label: 'Creator', desc: 'Content, shoots & editing' },
  { id: 'Researcher', icon: 'flask-outline', label: 'Researcher', desc: 'Papers, experiments & reviews' },
];

const ENERGY = [
  { id: 'Morning', label: '🌅 Morning', sub: '6AM–12PM peak' },
  { id: 'Afternoon', label: '☀️ Afternoon', sub: '12PM–5PM peak' },
  { id: 'Night Owl', label: '🌙 Night Owl', sub: '8PM–2AM peak' },
];

export default function ContextSetupScreen() {
  const router = useRouter();
  const { user, setProfile } = useStore();
  const [role, setRole] = useState('Professional');
  const [focusGoal, setFocusGoal] = useState('');
  const [energy, setEnergy] = useState('Morning');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: role, 2: goal+energy

  async function handleComplete() {
    if (!focusGoal.trim()) return;
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data, error } = await supabase
        .from('profiles')
        .update({ role, focus_goal: focusGoal, energy_pref: energy })
        .eq('id', session.user.id)
        .select()
        .single();
      if (data) setProfile(data as any);
    }

    setLoading(false);
    router.push('/(auth)/permissions');
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Progress */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => step === 1 ? router.back() : setStep(1)}>
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <View style={styles.progressDots}>
            {[1, 2, 3, 4].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === 2 ? styles.dotActive : i < 2 ? styles.dotDone : styles.dotInactive,
                ]}
              />
            ))}
          </View>
          <TouchableOpacity onPress={() => router.push('/(auth)/permissions')}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Context Setup</Text>
        <Text style={styles.subtitle}>
          Step 2/4: Tell us about yourself so Pickertime can make smart suggestions just for you.
        </Text>

        {step === 1 ? (
          <>
            <Text style={styles.sectionLabel}>PRIMARY ROLE</Text>
            <View style={styles.roleList}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => setRole(r.id)}
                  style={[styles.roleCard, role === r.id && styles.roleCardActive]}
                  activeOpacity={0.75}
                >
                  <View style={[styles.roleIconWrap, role === r.id && styles.roleIconWrapActive]}>
                    <Ionicons name={r.icon as any} size={20} color={role === r.id ? '#00D4FF' : 'rgba(255,255,255,0.5)'} />
                  </View>
                  <View style={styles.roleText}>
                    <Text style={[styles.roleLabel, role === r.id && styles.roleLabelActive]}>{r.label}</Text>
                    <Text style={styles.roleDesc}>{r.desc}</Text>
                  </View>
                  {role === r.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#00D4FF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => setStep(2)}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={16} color="#0A0F1D" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>FOCUS GOAL</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="flag-outline" size={16} color="rgba(255,255,255,0.3)" style={styles.inputIcon} />
              <TextInput
                value={focusGoal}
                onChangeText={setFocusGoal}
                placeholder={role === 'Student' ? 'e.g. Ace my finals' : 'e.g. Ship product v2.0'}
                placeholderTextColor="rgba(255,255,255,0.25)"
                style={styles.input}
              />
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>PEAK ENERGY WINDOW</Text>
            <View style={styles.energyRow}>
              {ENERGY.map((e) => (
                <TouchableOpacity
                  key={e.id}
                  onPress={() => setEnergy(e.id)}
                  style={[styles.energyCard, energy === e.id && styles.energyCardActive]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.energyLabel, energy === e.id && styles.energyLabelActive]}>{e.label}</Text>
                  <Text style={styles.energySub}>{e.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.nextBtn, !focusGoal.trim() && styles.nextBtnDisabled]}
              onPress={handleComplete}
              disabled={loading || !focusGoal.trim()}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#0A0F1D" />
              ) : (
                <>
                  <Text style={styles.nextBtnText}>Next: System Access</Text>
                  <Ionicons name="arrow-forward" size={16} color="#0A0F1D" />
                </>
              )}
            </TouchableOpacity>
          </>
        )}
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
  sectionLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, marginBottom: 12 },
  roleList: { gap: 10, marginBottom: 28 },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  roleCardActive: {
    backgroundColor: 'rgba(0,212,255,0.08)',
    borderColor: 'rgba(0,212,255,0.35)',
  },
  roleIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  roleIconWrapActive: { backgroundColor: 'rgba(0,212,255,0.15)' },
  roleText: { flex: 1 },
  roleLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  roleLabelActive: { color: '#fff' },
  roleDesc: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(10,15,29,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#fff' },
  energyRow: { flexDirection: 'row', gap: 10, marginBottom: 32 },
  energyCard: {
    flex: 1, padding: 14, borderRadius: 16, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  energyCardActive: {
    backgroundColor: 'rgba(0,212,255,0.10)',
    borderColor: 'rgba(0,212,255,0.35)',
  },
  energyLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 4, textAlign: 'center' },
  energyLabelActive: { color: '#fff' },
  energySub: { fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center' },
  nextBtn: {
    backgroundColor: '#00D4FF', borderRadius: 18, paddingVertical: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0F1D' },
});
