import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { pb } from '@/lib/pocketbase';

const ROLES = [
  { id: 'Student', icon: 'school', label: 'Student' },
  { id: 'Professional', icon: 'briefcase', label: 'Professional' },
  { id: 'Creator', icon: 'color-palette', label: 'Creator' },
  { id: 'Freelancer', icon: 'laptop', label: 'Freelancer' },
  { id: 'Researcher', icon: 'flask', label: 'Researcher' },
];

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('Professional');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!email || !password || !name) {
      Alert.alert('Missing Info', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      await pb.collection('Profiles').create({
        email,
        password,
        passwordConfirm: password,
        full_name: name,
        role,
      });
      
      // Auto-login after signup
      await pb.collection('Profiles').authWithPassword(email, password);
      
      router.push('/(auth)/context-setup');
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message || 'Error creating account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Background glows */}
      <View style={styles.glow1} />
      <View style={styles.dotGrid} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Join Pickertime and unlock your high-performance schedule.
          </Text>

          {/* Credentials Card */}
          <View style={styles.card}>
            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={16} color="rgba(255,255,255,0.3)" style={styles.inputIcon} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={16} color="rgba(255,255,255,0.3)" style={styles.inputIcon} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={styles.input}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                  <Ionicons
                    name={showPass ? 'eye-outline' : 'eye-off-outline'}
                    size={16}
                    color="rgba(255,255,255,0.35)"
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                <Ionicons name="checkmark-circle" size={10} color="#00D4FF" />
                {' '}Must be at least 8 characters
              </Text>
            </View>
          </View>

          {/* Profile Quick Start */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Profile Quick‑Start</Text>

            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={16} color="rgba(255,255,255,0.3)" style={styles.inputIcon} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your Name"
                placeholderTextColor="rgba(255,255,255,0.25)"
                style={styles.input}
              />
            </View>

            <Text style={styles.inputLabel}>Primary Role</Text>
            <View style={styles.chipsRow}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => setRole(r.id)}
                  style={[styles.chip, role === r.id && styles.chipActive]}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={r.icon as any}
                    size={12}
                    color={role === r.id ? '#00D4FF' : 'rgba(255,255,255,0.5)'}
                  />
                  <Text style={[styles.chipText, role === r.id && styles.chipTextActive]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.divider} />
          </View>

          {/* SSO Buttons */}
          <View style={styles.ssoRow}>
            <TouchableOpacity style={styles.ssoBtn} activeOpacity={0.7}>
              <Ionicons name="logo-apple" size={18} color="#fff" />
              <Text style={styles.ssoBtnText}>Apple</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ssoBtn} activeOpacity={0.7}>
              <Ionicons name="logo-google" size={16} color="#fff" />
              <Text style={styles.ssoBtnText}>Google</Text>
            </TouchableOpacity>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#0A0F1D" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Complete Setup</Text>
                <Ionicons name="arrow-forward" size={16} color="#0A0F1D" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/sign-in')}
            style={styles.signInLink}
          >
            <Text style={styles.signInLinkText}>
              Already have an account?{' '}
              <Text style={styles.signInLinkAccent}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F1D' },
  glow1: {
    position: 'absolute', top: -160, left: 0, right: 0,
    height: 500, borderRadius: 300,
    backgroundColor: 'rgba(0,212,255,0.06)',
  },
  dotGrid: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.12,
  },
  scroll: { flex: 1 },
  scrollContent: {
    maxWidth: 420, alignSelf: 'center', width: '100%',
    paddingHorizontal: 24, paddingBottom: 48,
  },
  header: { paddingTop: 56, marginBottom: 24 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 8 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 22, marginBottom: 28 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 24, padding: 20, marginBottom: 16, gap: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.6)', marginLeft: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(10,15,29,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#fff' },
  eyeBtn: { padding: 4 },
  hint: { fontSize: 11, color: '#00D4FF', marginLeft: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  chipActive: {
    backgroundColor: 'rgba(0,212,255,0.12)',
    borderColor: 'rgba(0,212,255,0.4)',
  },
  chipText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  chipTextActive: { color: '#00D4FF' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  divider: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },
  ssoRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  ssoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  ssoBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  primaryBtn: {
    backgroundColor: '#00D4FF', borderRadius: 18, paddingVertical: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8, marginBottom: 16,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0F1D' },
  signInLink: { alignItems: 'center', paddingVertical: 8 },
  signInLinkText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  signInLinkAccent: { color: '#00D4FF', fontWeight: '600' },
});
