import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, UserRole } from '@/store/useStore';
import { pb } from '@/lib/pocketbase';
import { cancelAllTaskNotifications } from '@/lib/notifications';
import { markIntentionalLogout } from '@/lib/session';
import { EnergyPref } from '@/lib/periods';

const ROLES: UserRole[] = ['Student', 'Professional', 'Freelancer', 'Creator', 'Researcher'];
const ENERGY_PREFS: EnergyPref[] = ['Morning', 'Afternoon', 'Night Owl'];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, setUser, setProfile, setTasks, refreshArmedAlarms } = useStore();
  const insets = useSafeAreaInsets();

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [role, setRole] = useState<UserRole>(profile?.role || 'Professional');
  const [focusGoal, setFocusGoal] = useState(profile?.focus_goal || '');
  const [energyPref, setEnergyPref] = useState<EnergyPref>(profile?.energy_pref || 'Morning');
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setFullName(profile?.full_name || '');
    setRole(profile?.role || 'Professional');
    setFocusGoal(profile?.focus_goal || '');
    setEnergyPref(profile?.energy_pref || 'Morning');
    setIsEditing(true);
  }

  async function handleSaveProfile() {
    if (!fullName.trim()) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const updated = await pb.collection('Profiles').update(user.id, {
        full_name: fullName.trim(),
        role,
        focus_goal: focusGoal.trim(),
        energy_pref: energyPref,
      });

      setProfile(updated as any);
      setIsEditing(false);
      Alert.alert('✅ Profile Updated', 'Your profile and preferences have been updated.');
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    // Sisa akun lama tidak boleh tinggal di HP: alarm yang sudah dijadwalkan dan
    // daftar task di store harus ikut dibersihkan (F-08).
    await cancelAllTaskNotifications();
    await refreshArmedAlarms();
    setTasks([]);
    // Logout yang memang ditekan user jangan sampai dibaca sebagai sesi kedaluwarsa (F-56).
    markIntentionalLogout();
    pb.authStore.clear();
    setUser(null);
    setProfile(null);
    router.replace('/(auth)/welcome');
  }

  return (
    <View style={styles.container}>
      <View style={styles.glow} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 120) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <View style={styles.headerActions}>
            {!isEditing ? (
              <TouchableOpacity onPress={startEditing} style={styles.editBtn}>
                <Ionicons name="create-outline" size={16} color="#00D4FF" />
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={18} color="#F87171" />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!isEditing ? (
          <>
            <View style={styles.card}>
              <View style={styles.avatarWrap}>
                <Ionicons name="person" size={40} color="rgba(255,255,255,0.8)" />
              </View>
              <Text style={styles.name}>{profile?.full_name || 'User'}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{profile?.role || 'Professional'}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>PREFERENCES</Text>
            <View style={styles.settingsCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <Ionicons name="flag-outline" size={20} color="#00D4FF" />
                  <Text style={styles.settingLabel}>Focus Goal</Text>
                </View>
                <Text style={styles.settingValue}>{profile?.focus_goal || 'Not set'}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <Ionicons name="flash-outline" size={20} color="#00D4FF" />
                  <Text style={styles.settingLabel}>Energy Preference</Text>
                </View>
                <Text style={styles.settingValue}>{profile?.energy_pref || 'Morning'}</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.editCard}>
            <Text style={styles.editCardTitle}>Edit Preferences</Text>

            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your full name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.textInput}
            />

            <Text style={styles.inputLabel}>Role</Text>
            <View style={styles.chipsRow}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  style={[styles.chip, role === r && styles.chipActive]}
                >
                  <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Focus Goal</Text>
            <TextInput
              value={focusGoal}
              onChangeText={setFocusGoal}
              placeholder="e.g. Complete thesis, ship MVP"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.textInput}
            />

            <Text style={styles.inputLabel}>Energy Preference</Text>
            <View style={styles.chipsRow}>
              {ENERGY_PREFS.map((ep) => (
                <TouchableOpacity
                  key={ep}
                  onPress={() => setEnergyPref(ep)}
                  style={[styles.chip, energyPref === ep && styles.chipActive]}
                >
                  <Text style={[styles.chipText, energyPref === ep && styles.chipTextActive]}>{ep}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.editActionRow}>
              <TouchableOpacity
                onPress={() => setIsEditing(false)}
                style={styles.cancelBtn}
                disabled={saving}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveProfile}
                style={styles.saveBtn}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#0A0F1D" />
                ) : (
                  <Text style={styles.saveText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
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
  content: { padding: 24, paddingTop: 60, maxWidth: 420, alignSelf: 'center', width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,212,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  editText: { color: '#00D4FF', fontWeight: '600', fontSize: 13 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(248,113,113,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  logoutText: { color: '#F87171', fontWeight: '600', fontSize: 13 },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 32 },
  avatarWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  name: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
  email: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 12 },
  roleBadge: { backgroundColor: 'rgba(0,212,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  roleText: { color: '#00D4FF', fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 },
  settingsCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 24, padding: 16 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLabel: { fontSize: 15, color: '#fff', fontWeight: '500' },
  settingValue: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 12 },

  // Edit card styling
  editCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', borderRadius: 24, padding: 20 },
  editCardTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 18 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 6, marginTop: 12 },
  textInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  chipActive: { backgroundColor: 'rgba(0,212,255,0.15)', borderColor: '#00D4FF' },
  chipText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  chipTextActive: { color: '#00D4FF', fontWeight: '700' },
  editActionRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 14 },
  saveBtn: { flex: 1, backgroundColor: '#00D4FF', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#0A0F1D', fontWeight: '700', fontSize: 14 },
});
