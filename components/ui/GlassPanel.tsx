import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';

interface GlassPanelProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  className?: string;
}

export default function GlassPanel({ children, style }: GlassPanelProps) {
  return (
    <View style={[styles.glass, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 20,
  },
});
