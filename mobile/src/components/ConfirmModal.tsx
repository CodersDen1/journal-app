import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadow, spacing, type } from '../theme';
import type { IoniconName } from './IconButton';
import { PrimaryButton } from './PrimaryButton';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Tints the icon badge + confirm button in the warning colour. */
  destructive?: boolean;
  /** Icon shown in the badge; defaults based on `destructive`. */
  icon?: IoniconName;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A calm, themed confirmation dialog — warm-paper card, tinted icon badge, and
 * stacked actions. Replaces the OS `Alert` for in-app confirmations so the
 * moment stays on-brand. Tapping the backdrop or the system back cancels.
 */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  icon,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const accent = destructive ? colors.recording : colors.primary;
  const badgeTint = destructive ? 'rgba(154, 79, 63, 0.12)' : 'rgba(111, 125, 90, 0.12)';
  const glyph: IoniconName = icon ?? (destructive ? 'alert-circle-outline' : 'help-circle-outline');

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        {/* Stop taps inside the card from dismissing. */}
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={[styles.badge, { backgroundColor: badgeTint }]}>
            <Ionicons name={glyph} size={28} color={accent} />
          </View>

          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={[type.bodyMuted, styles.message]}>{message}</Text> : null}

          <View style={styles.actions}>
            <PrimaryButton
              label={confirmLabel}
              onPress={onConfirm}
              style={destructive ? styles.destructive : undefined}
            />
            <PrimaryButton label={cancelLabel} variant="ghost" onPress={onCancel} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    ...shadow.floating,
  },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.serifMedium,
    fontSize: 21,
    lineHeight: 27,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  message: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  destructive: {
    backgroundColor: colors.recording,
  },
});
