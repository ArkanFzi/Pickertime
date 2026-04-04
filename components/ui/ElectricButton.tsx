import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native';

interface ElectricButtonProps {
  label: string;
  onPress: () => void;
  icon?: string;
  variant?: 'primary' | 'ghost';
  style?: ViewStyle;
  disabled?: boolean;
}

export default function ElectricButton({
  label,
  onPress,
  variant = 'primary',
  style,
  disabled,
}: ElectricButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : styles.ghost,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, variant === 'ghost' && styles.ghostLabel]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primary: {
    backgroundColor: '#00D4FF',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  ghost: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A0F1D',
  },
  ghostLabel: {
    color: '#fff',
  },
});
