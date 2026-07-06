import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';

import { colors, hitSize, radius } from '../theme';

export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface IconButtonProps {
  name: IoniconName;
  onPress: () => void;
  /** Required for accessibility — describe the action, e.g. "Open profile". */
  accessibilityLabel: string;
  size?: number;
  color?: string;
  /** 'plain' = transparent; 'surface' = soft rounded chip behind the icon. */
  variant?: 'plain' | 'surface';
  disabled?: boolean;
  style?: ViewStyle;
}

/** A 44×44 minimum tap target wrapping a single icon. */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  size = 24,
  color = colors.text,
  variant = 'plain',
  disabled = false,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        variant === 'surface' && styles.surface,
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: hitSize,
    minHeight: hitSize,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  surface: {
    backgroundColor: colors.softSurface,
    borderRadius: radius.pill,
  },
});
