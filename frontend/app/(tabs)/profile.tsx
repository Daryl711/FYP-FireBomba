import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../constants/theme';
import { useApp } from '../../src/context/AppContext';

export default function ProfileTabRoute() {
  const { user, systemStatus } = useApp() as any;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Account and system information</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{user?.name || 'User'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Sensors Online</Text>
          <Text style={styles.value}>{systemStatus.sensorsOnline}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>System Uptime</Text>
          <Text style={styles.value}>{systemStatus.uptime}%</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Fire Events</Text>
          <Text style={styles.value}>{systemStatus.fireEvents}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.text2,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOW.small,
  },
  label: {
    color: COLORS.text2,
    fontSize: 12,
  },
  value: {
    marginTop: 6,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
