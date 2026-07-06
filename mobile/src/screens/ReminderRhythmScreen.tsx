import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppShell, ScreenHeader, SettingRow } from "../components";
import { colors, spacing, radius, type } from "../theme";
import type { ReminderRhythm } from "../types";
import { useProfile } from "../state/ProfileContext";
import { useAppNavigation } from "../navigation/useAppNavigation";

type RhythmOption = {
  value: ReminderRhythm;
  label: string;
  description: string;
};

const OPTIONS: RhythmOption[] = [
  { value: "off", label: "Off", description: "No reminders" },
  { value: "daily", label: "Every day", description: "A quiet nudge each evening" },
  { value: "weekdays", label: "Weekdays", description: "Monday to Friday" },
  { value: "weekends", label: "Weekends", description: "Saturday and Sunday" },
  { value: "custom", label: "Custom", description: "Pick your own days" },
];

export function ReminderRhythmScreen() {
  const navigation = useAppNavigation();
  const { profile, update } = useProfile();

  return (
    <AppShell
      scroll
      header={<ScreenHeader title="Reminder rhythm" onBack={navigation.goBack} />}
    >
      <Text style={[type.bodyMuted, styles.intro]}>
        Choose how often Still gently reminds you to write. No streaks, no pressure.
      </Text>

      <View style={styles.card}>
        {OPTIONS.map((option, index) => {
          const selected = profile.reminderRhythm === option.value;
          return (
            <SettingRow
              key={option.value}
              label={option.label}
              description={option.description}
              onPress={() => update({ reminderRhythm: option.value })}
              right={
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={22}
                  color={selected ? colors.primary : colors.border}
                />
              }
              last={index === OPTIONS.length - 1}
            />
          );
        })}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
});
