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

  // A text value shares the row with the label: the label keeps its width on
  // one line and the value fills the rest, ellipsizing (e.g. a long email)
  // instead of forcing the label to wrap.
  const hasTextValue = value !== undefined && !right;

  const iconNode = icon ? (
    <View style={styles.iconWrap}>
      <Ionicons name={icon} size={20} color={destructive ? colors.recording : colors.mutedText} />
    </View>
  ) : null;

  const chevronNode = chevron ? (
    <Ionicons name="chevron-forward" size={18} color={colors.mutedText} style={styles.chevron} />
  ) : null;

  const body = (
    <View style={[styles.row, last && styles.rowLast]}>
      {iconNode}

      {hasTextValue ? (
        <>
          <Text style={[type.body, styles.labelInline, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[type.bodyMuted, styles.valueInline]} numberOfLines={1} ellipsizeMode="tail">
            {value}
          </Text>
          {chevronNode}
        </>
      ) : (
        <>
          <View style={styles.textWrap}>
            <Text style={[type.body, { color: labelColor }]} numberOfLines={1}>
              {label}
            </Text>
            {description ? (
              <Text style={[type.caption, styles.description]} numberOfLines={2}>
                {description}
              </Text>
            ) : null}
          </View>
          <View style={styles.rightSlot}>
            {right ?? chevronNode}
          </View>
        </>
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
  // Inline label + value (single-line row)
  labelInline: { flexShrink: 0, paddingRight: spacing.md },
  valueInline: { flex: 1, textAlign: 'right', color: colors.mutedText },
  chevron: { marginLeft: spacing.sm },
  pressed: { opacity: 0.6 },
});
