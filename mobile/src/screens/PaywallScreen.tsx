import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell, IconButton, PlanCard, PrimaryButton, ScreenHeader } from '../components';
import { api } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { useEntitlement } from '../state/EntitlementContext';
import { colors, spacing, type } from '../theme';
import type { BillingPlan, BillingPlanKey } from '../types';

const FEATURES: string[] = [
  'Unlimited journal entries, text and voice',
  'Weekly and monthly AI insights',
  'Accurate voice transcription',
  'Encrypted backup and sync across devices',
  'Export your journal any time',
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: '$',
  eur: '€',
  gbp: '£',
  aed: 'AED ',
  inr: '₹',
};

const PLAN_META: Record<BillingPlanKey, { title: string; badge?: string }> = {
  monthly: { title: 'Monthly' },
  yearly: { title: 'Yearly', badge: 'Best value' },
  lifetime: { title: 'Lifetime' },
};

function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency?.toLowerCase()] ?? (currency ? `${currency.toUpperCase()} ` : '$');
  const major = amount / 100;
  const value = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return `${symbol}${value}`;
}

function planPeriod(plan: BillingPlan): string {
  if (plan.mode === 'payment') return 'one-time';
  if (plan.interval === 'year') return 'per year';
  if (plan.interval === 'month') return 'per month';
  return '';
}

function planFeatures(plan: BillingPlan): string[] {
  if (plan.key === 'lifetime') return ['One-time purchase', 'Yours forever'];
  if (plan.key === 'yearly') return ['Billed annually', 'Cancel any time'];
  return ['Billed monthly', 'Cancel any time'];
}

/**
 * Blocking subscription gate. Rendered by the app Shell whenever a signed-in
 * user has no active entitlement — there is no dismiss; the app is unreachable
 * until the server confirms access. Plans (and their live prices) come from the
 * backend; choosing one opens Stripe's hosted Checkout in the browser and the
 * status is re-verified on return.
 */
export function PaywallScreen() {
  const { busy, subscribe, refresh } = useEntitlement();
  const { signOut } = useAuth();
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<BillingPlanKey | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .billingPlans()
      .then((list) => {
        if (cancelled) return;
        setPlans(list);
        // Default to yearly (best value) if offered, else the first plan.
        const preferred = list.find((p) => p.key === 'yearly') ?? list[0];
        if (preferred) setSelectedKey(preferred.key);
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPlan = useMemo(
    () => plans?.find((p) => p.key === selectedKey) ?? null,
    [plans, selectedKey],
  );
  const ctaLabel = selectedPlan?.mode === 'payment' ? 'Buy lifetime' : 'Subscribe';

  const onSubscribe = async () => {
    if (!selectedKey) return;
    try {
      await subscribe(selectedKey);
      // On return from the browser the Shell swaps to the app once the server
      // confirms (EntitlementContext re-verifies on foreground).
    } catch {
      Alert.alert('Couldn’t start checkout', 'Please check your connection and try again.');
    }
  };

  const onAlreadySubscribed = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };

  const hasPlans = (plans?.length ?? 0) > 0;

  return (
    <AppShell
      scroll
      header={
        <ScreenHeader
          right={
            <IconButton
              name="refresh"
              onPress={() => void onAlreadySubscribed()}
              accessibilityLabel="Refresh subscription status"
            />
          }
        />
      }
      footer={
        <View>
          <PrimaryButton label={ctaLabel} onPress={onSubscribe} loading={busy} disabled={!selectedKey} />
          <Pressable onPress={() => void onAlreadySubscribed()} accessibilityRole="button" style={styles.linkRow}>
            <Text style={[type.caption, styles.link]}>
              {checking ? 'Checking…' : 'I already subscribed'}
            </Text>
          </Pressable>
          <Pressable onPress={() => void signOut()} accessibilityRole="button" style={styles.linkRow}>
            <Text style={[type.caption, styles.linkMuted]}>Sign out</Text>
          </Pressable>
          <Text style={[type.caption, styles.footerNote]}>
            Secure checkout by Stripe. Cancel any time.
          </Text>
        </View>
      }
    >
      <View style={styles.hero}>
        <Text style={type.overline}>Still Pro</Text>
        <Text style={[type.title, styles.heroTitle]}>Your private journal, fully unlocked</Text>
        <Text style={[type.bodyMuted, styles.heroBody]}>
          Everything Still offers, for a calm long-term practice.
        </Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={[type.body, styles.featureText]}>{feature}</Text>
          </View>
        ))}
      </View>

      {hasPlans ? (
        <View style={styles.plans}>
          {plans!.map((plan) => {
            const meta = PLAN_META[plan.key];
            const price =
              plan.amount > 0 ? formatAmount(plan.amount, plan.currency) : 'See price at checkout';
            return (
              <PlanCard
                key={plan.key}
                title={meta.title}
                price={price}
                period={planPeriod(plan)}
                features={planFeatures(plan)}
                badge={meta.badge}
                selected={selectedKey === plan.key}
                onPress={() => setSelectedKey(plan.key)}
              />
            );
          })}
        </View>
      ) : plans === null ? (
        <View style={styles.emptyPlans}>
          <Text style={[type.bodyMuted, styles.emptyText]}>Loading plans…</Text>
        </View>
      ) : (
        <View style={styles.emptyPlans}>
          <Text style={[type.bodyMuted, styles.emptyText]}>
            Plans couldn’t be loaded. Check your connection and tap refresh.
          </Text>
        </View>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginBottom: spacing.xxl,
  },
  heroTitle: {
    marginTop: spacing.sm,
  },
  heroBody: {
    marginTop: spacing.md,
  },
  features: {
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  featureText: {
    flex: 1,
  },
  plans: {
    gap: spacing.md,
  },
  emptyPlans: {
    paddingVertical: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
  },
  linkRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  link: {
    color: colors.primary,
  },
  linkMuted: {
    color: colors.mutedText,
  },
  footerNote: {
    marginTop: spacing.sm,
    textAlign: 'center',
    color: colors.mutedText,
  },
});
