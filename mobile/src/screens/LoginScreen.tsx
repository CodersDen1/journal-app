import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppShell, IconButton, PrimaryButton, ScreenHeader } from '../components';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useAuth } from '../state/AuthContext';
import { colors, radius, spacing, type } from '../theme';

export function LoginScreen() {
  const navigation = useAppNavigation();
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const onGoogle = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      // A cancelled sign-in is not worth an alert.
      if (!/cancel/i.test(message)) {
        Alert.alert('Could not sign in', message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      scroll
      header={
        <ScreenHeader
          left={<IconButton name="close" onPress={navigation.goBack} accessibilityLabel="Close" />}
        />
      }
      footer={
        <View>
          <PrimaryButton
            label="Continue with Google"
            onPress={onGoogle}
            loading={busy}
            icon={<Ionicons name="logo-google" size={18} color={colors.onPrimary} />}
          />
          <Text style={[type.caption, styles.legal]}>
            Your journal stays private. Signing in only backs it up to your account.
          </Text>
        </View>
      }
    >
      <View style={styles.brand}>
        <View style={styles.mark}>
          <Ionicons name="leaf-outline" size={28} color={colors.primary} />
        </View>
        <Text style={type.greeting}>Still</Text>
        <Text style={[type.bodyMuted, styles.tagline]}>
          Sign in to keep your writing backed up and in sync across your devices — and to unlock
          voice transcription and insights.
        </Text>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
    paddingHorizontal: spacing.md,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  tagline: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  legal: {
    textAlign: 'center',
    marginTop: spacing.md,
    color: colors.mutedText,
  },
});
