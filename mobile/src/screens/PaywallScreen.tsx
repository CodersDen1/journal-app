import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PurchasesPackage } from "react-native-purchases";

import {
  AppShell,
  ScreenHeader,
  IconButton,
  PlanCard,
  PrimaryButton,
} from "../components";
import { useAuth } from "../state/AuthContext";
import { useEntitlement } from "../state/EntitlementContext";
import { colors, spacing, type } from "../theme";

const FEATURES: string[] = [
  "Unlimited journal entries, text and voice",
  "Weekly and monthly AI insights",
  "Accurate voice transcription",
  "Encrypted backup and sync across devices",
  "Export your journal any time",
];

interface PlanInfo {
  title: string;
  price: string;
  period: string;
  /** Human trial line, e.g. "7-day free trial" — null when none. */
  trial: string | null;
  badge?: string;
}

/** Describe a RevenueCat package for the plan cards and CTA. */
function describe(pkg: PurchasesPackage): PlanInfo {
  const product = pkg.product;
  const intro = product.introPrice;
  const trial =
    intro && intro.price === 0
      ? `${intro.periodNumberOfUnits}-${intro.periodUnit.toLowerCase()} free trial`
      : null;

  switch (pkg.packageType) {
    case "ANNUAL":
      return { title: "Yearly", price: product.priceString, period: "per year", trial, badge: "Best value" };
    case "MONTHLY":
      return { title: "Monthly", price: product.priceString, period: "per month", trial };
    case "LIFETIME":
      return { title: "Lifetime", price: product.priceString, period: "one-time", trial: null };
    default:
      return { title: product.title, price: product.priceString, period: "", trial };
  }
}

/**
 * Blocking subscription gate. Rendered by the app Shell whenever a signed-in
 * user has no active entitlement — there is no dismiss; the app is unreachable
 * until the server confirms an active subscription.
 */
export function PaywallScreen() {
  const { packages, busy, purchase, restore, refresh } = useEntitlement();
  const { signOut } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default to the annual package (or the first available) once offerings load.
  useEffect(() => {
    if (selectedId || packages.length === 0) return;
    const annual = packages.find((p) => p.packageType === "ANNUAL");
    setSelectedId((annual ?? packages[0]).identifier);
  }, [packages, selectedId]);

  const selected = useMemo(
    () => packages.find((p) => p.identifier === selectedId) ?? null,
    [packages, selectedId],
  );

  const onSubscribe = async () => {
    if (!selected) return;
    try {
      await purchase(selected);
      // On success the Shell swaps to the app once the server confirms.
    } catch (error) {
      const e = error as { userCancelled?: boolean; message?: string };
      if (e?.userCancelled) return;
      Alert.alert("Purchase failed", e?.message ?? "Please try again.");
    }
  };

  const onRestore = async () => {
    try {
      await restore();
    } catch {
      Alert.alert("Nothing to restore", "We couldn't find a previous subscription for this account.");
    }
  };

  const selectedInfo = selected ? describe(selected) : null;
  const ctaLabel = selectedInfo?.trial
    ? "Start free trial"
    : selectedInfo?.period === "one-time"
      ? "Buy"
      : "Subscribe";
  const hasPlans = packages.length > 0;

  return (
    <AppShell
      scroll
      header={
        <ScreenHeader
          right={
            <IconButton
              name="refresh"
              onPress={() => void refresh()}
              accessibilityLabel="Refresh subscription status"
            />
          }
        />
      }
      footer={
        <View>
          <PrimaryButton
            label={ctaLabel}
            onPress={onSubscribe}
            loading={busy}
            disabled={!selected}
          />
          <Pressable onPress={onRestore} accessibilityRole="button" style={styles.linkRow}>
            <Text style={[type.caption, styles.link]}>Restore purchases</Text>
          </Pressable>
          <Pressable onPress={() => void signOut()} accessibilityRole="button" style={styles.linkRow}>
            <Text style={[type.caption, styles.linkMuted]}>Sign out</Text>
          </Pressable>
          <Text style={[type.caption, styles.footerNote]}>
            Cancel any time in your App Store or Google Play settings.
          </Text>
        </View>
      }
    >
      <View style={styles.hero}>
        <Text style={type.overline}>Still Pro</Text>
        <Text style={[type.title, styles.heroTitle]}>
          Your private journal, fully unlocked
        </Text>
        <Text style={[type.bodyMuted, styles.heroBody]}>
          Start with a free trial. Everything Still offers, for a calm long-term
          practice.
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
          {packages.map((pkg) => {
            const info = describe(pkg);
            return (
              <PlanCard
                key={pkg.identifier}
                title={info.title}
                price={info.price}
                period={info.trial ? `${info.trial}, then ${info.period}` : info.period}
                features={
                  info.trial
                    ? [info.trial, "Cancel any time"]
                    : info.period === "one-time"
                      ? ["One-time purchase", "Yours forever"]
                      : ["Cancel any time"]
                }
                badge={info.badge}
                selected={selectedId === pkg.identifier}
                onPress={() => setSelectedId(pkg.identifier)}
              />
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyPlans}>
          <Text style={[type.bodyMuted, styles.emptyText]}>
            Plans couldn't be loaded. Check your connection and tap refresh.
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
    flexDirection: "row",
    alignItems: "flex-start",
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
    textAlign: "center",
  },
  linkRow: {
    alignItems: "center",
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
    textAlign: "center",
    color: colors.mutedText,
  },
});
