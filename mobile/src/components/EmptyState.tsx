import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '../theme';
import type { IoniconName } from './IconButton';
import { PrimaryButton } from './PrimaryButton';

interface EmptyStateProps {
  icon?: IoniconName;
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
}

/** Calm, centered empty state. Used for empty lists, search, and insights. */
export function EmptyState({ icon = 'book-outline', title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[type.heading, styles.title]}>{title}</Text>
      <Text style={[type.bodyMuted, styles.message]}>{message}</Text>
      {action ? (
        <View style={styles.action}>
          <PrimaryButton label={action.label} onPress={action.onPress} fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { textAlign: 'center', marginBottom: spacing.sm },
  message: { textAlign: 'center', maxWidth: 300 },
  action: { marginTop: spacing.xl },
});
