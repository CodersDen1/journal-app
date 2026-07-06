import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadow, spacing, type } from '../theme';

interface PlanCardProps {
  title: string;
  price: string;
  /** e.g. "per month" or "billed yearly". */
  period?: string;
  features: string[];
  /** Emphasise this card (sage border, lifted). */
  highlighted?: boolean;
  /** Small badge, e.g. "Best value". */
  badge?: string;
  /** Selected radio state (for multi-plan selection). */
  selected?: boolean;
  onPress?: () => void;
}

/** A pricing option for the paywall. */
export function PlanCard({
  title,
  price,
  period,
  features,
  highlighted = false,
  badge,
  selected = false,
  onPress,
}: PlanCardProps) {
  const emphasised = highlighted || selected;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'radio' : undefined}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.card,
        emphasised && styles.cardEmphasised,
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}

      <View style={styles.headerRow}>
        <Text style={type.heading}>{title}</Text>
        {onPress ? (
          <Ionicons
            name={selected ? 'radio-button-on' : 'radio-button-off'}
            size={22}
            color={selected ? colors.primary : colors.border}
          />
        ) : null}
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{price}</Text>
        {period ? <Text style={[type.caption, styles.period]}>{period}</Text> : null}
      </View>

      <View style={styles.features}>
        {features.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons name="checkmark" size={18} color={colors.primary} style={styles.check} />
            <Text style={[type.bodyMuted, styles.featureText]}>{feature}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  cardEmphasised: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    ...shadow.card,
  },
  pressed: { opacity: 0.9 },
  badge: {
    position: 'absolute',
    top: -10,
    right: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    ...type.overline,
    color: colors.onPrimary,
    letterSpacing: 0.6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.sm },
  price: { ...type.title, fontSize: 28, lineHeight: 32, color: colors.text },
  period: { marginLeft: spacing.sm, marginBottom: 4 },
  features: { marginTop: spacing.lg, gap: spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start' },
  check: { marginRight: spacing.sm, marginTop: 2 },
  featureText: { flex: 1, color: colors.text },
});
