import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadow, spacing, type } from '../theme';

interface UndoSnackbarProps {
  visible: boolean;
  message: string;
  actionLabel?: string;
  onAction: () => void;
  onDismiss: () => void;
}

/**
 * Bottom snackbar with an undo action. Slides up above the home indicator.
 * Visibility is driven by the `visible` prop; the parent owns auto-dismiss.
 */
export function UndoSnackbar({ visible, message, actionLabel = 'Undo', onAction, onDismiss }: UndoSnackbarProps) {
  const insets = useSafeAreaInsets();
  const translate = useRef(new Animated.Value(120)).current;

  useEffect(() => {
    Animated.timing(translate, {
      toValue: visible ? 0 : 120,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, translate]);

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, spacing.lg), transform: [{ translateY: translate }] },
      ]}
    >
      <View style={styles.bar}>
        <Text style={[type.body, styles.message]} numberOfLines={1}>
          {message}
        </Text>
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={10}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      </View>
      {/* onDismiss is invoked by the parent's timer; kept in the API for manual dismissal. */}
      {visible ? null : <Pressable accessibilityElementsHidden onPress={onDismiss} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.floating,
  },
  message: { color: colors.onPrimary, flex: 1, marginRight: spacing.md },
  action: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  pressed: { opacity: 0.6 },
  actionText: { ...type.label, color: colors.primary },
});
