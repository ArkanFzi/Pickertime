import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { pb } from '@/lib/pocketbase';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Enter your email and password.');
      return;
    }
    try {
      await pb.collection('Profiles').authWithPassword(email, password);
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Sign In Failed', error.message || 'Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                  style={styles.input} keyboardType="email-address" autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
                <TouchableOpacity>
                  <Text style={styles.forgot}>Forgot?</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={16} color="rgba(255,255,255,0.3)" style={styles.icon} />
                <TextInput
                  value={password} onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.25)"
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
});
