import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '../theme';
import { IconButton } from './IconButton';

interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  /** When set, a back chevron is shown on the left. */
  onBack?: () => void;
  /** Custom left slot (overrides the back chevron). */
  left?: React.ReactNode;
  /** Right-aligned actions, e.g. profile or search IconButtons. */
  right?: React.ReactNode;
  /** Large paper-style title (used for section screens like Journals). */
  large?: boolean;
}

/**
 * Consistent top header: optional back button, title/subtitle, right actions.
 * Keeps a fixed minimum height so titles never crowd the status bar.
 */
export function ScreenHeader({ title, subtitle, onBack, left, right, large = false }: ScreenHeaderProps) {
  const leftSlot = left ?? (onBack ? (
    <IconButton name="chevron-back" onPress={onBack} accessibilityLabel="Go back" />
  ) : null);

  return (
    <View style={styles.container}>
      <View style={styles.side}>{leftSlot}</View>

      <View style={[styles.center, large && styles.centerLarge]}>
        {title ? (
          <Text style={large ? type.title : type.heading} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={[type.caption, styles.subtitle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  side: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideRight: {
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  centerLarge: {
    alignItems: 'flex-start',
  },
  subtitle: {
    marginTop: 2,
    color: colors.mutedText,
  },
});
