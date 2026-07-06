import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  AppShell,
  ScreenHeader,
  IconButton,
  PlanCard,
  PrimaryButton,
} from "../components";
import { useProfile } from "../state/ProfileContext";
import { useAppNavigation } from "../navigation/useAppNavigation";
import { colors, spacing, type } from "../theme";

const FEATURES: string[] = [
  "Unlimited AI insights, weekly and monthly",
  "Accurate voice transcription",
  "Encrypted backup and sync across devices",
  "App lock with Face ID",
  "Export your journal any time",
];

export function PaywallScreen() {
  const { upgradeToPlus } = useProfile();
  const navigation = useAppNavigation();
  const [selected, setSelected] = useState<"monthly" | "yearly">("yearly");

  return (
    <AppShell
      scroll
      header={
        <ScreenHeader
          left={
            <IconButton
              name="close"
              onPress={navigation.goBack}
              accessibilityLabel="Close"
            />
          }
        />
      }
      footer={
        <View>
          <PrimaryButton
            label="Start Still Plus"
            onPress={() => {
              upgradeToPlus();
              navigation.goBack();
            }}
          />
          <Text style={[type.caption, styles.footerNote]}>
            Cancel any time. Payments are simulated in this demo.
          </Text>
        </View>
      }
    >
      <View style={styles.hero}>
        <Text style={type.overline}>Still Plus</Text>
        <Text style={[type.title, styles.heroTitle]}>
          Deeper reflection, gently unlocked
        </Text>
        <Text style={[type.bodyMuted, styles.heroBody]}>
          Everything in Still, plus the features that make a long-term practice
          effortless.
        </Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.primary}
            />
            <Text style={[type.body, styles.featureText]}>{feature}</Text>
          </View>
        ))}
      </View>

      <View style={styles.plans}>
        <PlanCard
          title="Yearly"
          price="$49.99"
          period="per year · $4.17/mo"
          features={["Best value", "Everything in Still Plus"]}
          badge="Save 30%"
          selected={selected === "yearly"}
          onPress={() => setSelected("yearly")}
        />
        <PlanCard
          title="Monthly"
          price="$5.99"
          period="per month"
          features={["Billed monthly", "Cancel any time"]}
          selected={selected === "monthly"}
          onPress={() => setSelected("monthly")}
        />
      </View>
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
  footerNote: {
    marginTop: spacing.md,
    textAlign: "center",
    color: colors.mutedText,
  },
});
