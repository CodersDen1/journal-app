import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, hitSize, spacing, type } from '../theme';
import type { IoniconName } from './IconButton';

interface SettingRowProps {
  label: string;
  description?: string;
  /** Right-aligned value text (e.g. current selection). */
  value?: string;
  /** Custom right element (e.g. a Switch). Overrides the chevron. */
  right?: React.ReactNode;
  onPress?: () => void;
  icon?: IoniconName;
  /** Show a trailing chevron (implied when onPress is set and no `right`). */
  showChevron?: boolean;
  destructive?: boolean;
  /** Hide the bottom hairline (for the last row in a group). */
  last?: boolean;
}

/** A single settings row. Min height 44; used inside grouped surfaces. */
export function SettingRow({
  label,
  description,
  value,
  right,
  onPress,
  icon,
  showChevron,
  destructive = false,
  last = false,
}: SettingRowProps) {
  const chevron = (showChevron ?? Boolean(onPress)) && !right;
  const labelColor = destructive ? colors.recording : colors.text;

  const body = (
    <View style={[styles.row, last && styles.rowLast]}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={destructive ? colors.recording : colors.mutedText} />
        </View>
      ) : null}

      <View style={styles.textWrap}>
        <Text style={[type.body, { color: labelColor }]}>{label}</Text>
        {description ? <Text style={[type.caption, styles.description]}>{description}</Text> : null}
      </View>

      {right ? (
        <View style={styles.rightSlot}>{right}</View>
      ) : (
        <View style={styles.rightSlot}>
          {value ? <Text style={[type.bodyMuted, styles.value]}>{value}</Text> : null}
          {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.mutedText} /> : null}
        </View>
      )}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: hitSize + 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  iconWrap: { width: 32, alignItems: 'flex-start' },
  textWrap: { flex: 1, paddingRight: spacing.md },
  description: { marginTop: 2 },
  rightSlot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  value: { color: colors.mutedText },
  pressed: { opacity: 0.6 },
});
