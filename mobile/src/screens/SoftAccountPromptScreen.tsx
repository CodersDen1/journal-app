import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "../components";
import { useAppNavigation } from "../navigation/useAppNavigation";
import { colors, radius, shadow, spacing, type } from "../theme";

export function SoftAccountPromptScreen() {
  const navigation = useAppNavigation();

  return (
    <View style={styles.container}>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Dismiss"
        onPress={() => navigation.goBack()}
      />
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.primary} />
        </View>
        <Text style={[type.title, styles.title]}>Keep your journal safe</Text>
        <Text style={[type.bodyMuted, styles.body]}>
          Create a free account to back up your entries and unlock insights on
          every device. Your writing stays private and encrypted.
        </Text>
        <PrimaryButton
          label="Create account"
          onPress={() => {
            navigation.goBack();
            navigation.navigate("Login");
          }}
          style={styles.primaryAction}
        />
        <PrimaryButton
          variant="ghost"
          label="Not now"
          onPress={() => navigation.goBack()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.floating,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.softSurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    marginBottom: spacing.sm,
  },
  body: {
    marginBottom: spacing.xl,
  },
  primaryAction: {
    marginBottom: spacing.sm,
  },
});
