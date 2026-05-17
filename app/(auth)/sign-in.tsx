import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { pb } from '@/lib/pocketbase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- Forgot Password State ---
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleSignIn() {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await pb.collection('Profiles').authWithPassword(email, password);
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Sign In Failed', error.message || 'Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!forgotEmail.trim()) {
      Alert.alert('Email Required', 'Please enter your registered email address.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setForgotLoading(true);
    try {
      await pb.collection('Profiles').requestPasswordReset(forgotEmail.trim());
      setForgotSent(true);
    } catch (error: any) {
      // PocketBase mengembalikan sukses bahkan jika email tidak terdaftar
      // (mencegah email enumeration attack) — tampilkan sukses tetap
      setForgotSent(true);
    } finally {
      setForgotLoading(false);
    }
  }

  function closeForgotModal() {
    setForgotVisible(false);
    setForgotEmail('');
    setForgotSent(false);
    setForgotLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 48) + 20 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue your focus journey.</Text>

          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={16} color="rgba(255,255,255,0.3)" style={styles.icon} />
                <TextInput
                  value={email} onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  cursorColor="#00D4FF"
                  style={styles.input} keyboardType="email-address" autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
                {/* ✅ FIXED: Tombol Forgot? membuka modal reset password */}
                <TouchableOpacity onPress={() => { setForgotEmail(email); setForgotVisible(true); }}>
                  <Text style={styles.forgot}>Forgot?</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={16} color="rgba(255,255,255,0.3)" style={styles.icon} />
                <TextInput
                  value={password} onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  cursorColor="#00D4FF"
                  style={styles.input} secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                  <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={16} color="rgba(255,255,255,0.35)" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn} onPress={handleSignIn}
            disabled={loading} activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#0A0F1D" /> : (
              <>
                <Text style={styles.primaryBtnText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={16} color="#0A0F1D" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')} style={styles.signUpLink}>
            <Text style={styles.signUpLinkText}>
              Don't have an account?{' '}
              <Text style={styles.accent}>Create one</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ✅ Forgot Password Modal */}
      <Modal
        visible={forgotVisible}
        transparent
        animationType="fade"
        onRequestClose={closeForgotModal}
        statusBarTranslucent
      >
        <Pressable style={styles.modalOverlay} onPress={closeForgotModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalGlow} />

            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="key-outline" size={22} color="#00D4FF" />
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={closeForgotModal}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            {forgotSent ? (
              /* Success State */
              <View style={styles.successWrap}>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark-circle" size={48} color="#34D399" />
                </View>
                <Text style={styles.modalTitle}>Check Your Inbox</Text>
                <Text style={styles.modalSubtitle}>
                  If an account with{'\n'}
                  <Text style={styles.emailHighlight}>{forgotEmail}</Text>
                  {'\n'}exists, a reset link has been sent.
                </Text>
                <TouchableOpacity style={styles.doneBtn} onPress={closeForgotModal} activeOpacity={0.85}>
                  <Text style={styles.doneBtnText}>Got it</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Input State */
              <>
                <Text style={styles.modalTitle}>Reset Password</Text>
                <Text style={styles.modalSubtitle}>
                  Enter your registered email and we'll send you a reset link.
                </Text>

                <View style={styles.modalInputWrap}>
                  <Ionicons name="mail-outline" size={16} color="rgba(255,255,255,0.3)" style={styles.icon} />
                  <TextInput
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    cursorColor="#00D4FF"
                    style={styles.input}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[styles.sendBtn, forgotLoading && { opacity: 0.6 }]}
                  onPress={handleForgotPassword}
                  disabled={forgotLoading}
                  activeOpacity={0.85}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#0A0F1D" size="small" />
                  ) : (
                    <>
                      <Ionicons name="send-outline" size={15} color="#0A0F1D" />
                      <Text style={styles.sendBtnText}>Send Reset Link</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelLink} onPress={closeForgotModal}>
                  <Text style={styles.cancelLinkText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F1D' },
  glow: {
    position: 'absolute', top: -150, left: 0, right: 0, height: 400,
    borderRadius: 300, backgroundColor: 'rgba(0,212,255,0.06)',
  },
  content: { maxWidth: 420, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingBottom: 48 },
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
    borderRadius: 24, padding: 20, marginBottom: 24, gap: 16,
  },
  inputGroup: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.6)', marginLeft: 4 },
  forgot: { fontSize: 12, color: '#00D4FF', fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(10,15,29,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#fff' },
  primaryBtn: {
    backgroundColor: '#00D4FF', borderRadius: 18, paddingVertical: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8, marginBottom: 16,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0F1D' },
  signUpLink: { alignItems: 'center', paddingVertical: 8 },
  signUpLinkText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  accent: { color: '#00D4FF', fontWeight: '600' },

  // ─── Modal styles ───────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#0E1526',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)',
    borderRadius: 28, padding: 28, overflow: 'hidden',
  },
  modalGlow: {
    position: 'absolute', top: -40, right: -40, width: 150, height: 150,
    borderRadius: 75, backgroundColor: 'rgba(0,212,255,0.08)',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  modalIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,212,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 22, marginBottom: 20, textAlign: 'center' },
  modalInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(10,15,29,0.8)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14,
  },
  sendBtn: {
    backgroundColor: '#00D4FF', borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#00D4FF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: '#0A0F1D' },
  cancelLink: { alignItems: 'center', paddingVertical: 12 },
  cancelLinkText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },

  // ─── Success state ───────────────────────────────────────────────
  successWrap: { alignItems: 'center', paddingVertical: 8 },
  successIcon: { marginBottom: 16 },
  emailHighlight: { color: '#00D4FF', fontWeight: '600' },
  doneBtn: {
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.35)',
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40,
    marginTop: 20,
  },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: '#34D399' },
});
