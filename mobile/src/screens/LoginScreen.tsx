import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppShell, BrandMark, PrimaryButton } from '../components';
import { CLAUDE_CLAY } from '../components/BrandMark';
import { useAuth } from '../state/AuthContext';
import { colors, radius, spacing, type } from '../theme';

/**
 * Full-screen auth gate. Shown whenever no one is signed in; on success the
 * app swaps to the main experience automatically (no navigation needed here).
 */
export function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const onGoogle = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      // AuthContext.user updates → the gate reveals the app.
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      if (!/cancel/i.test(message)) Alert.alert('Could not sign in', message);
    } finally {
      setBusy(false);
    }
  };

  const footer = (
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
  );

  return (
    <AppShell footer={footer} scroll contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.markWrap}>
          <View style={styles.glow} />
          <BrandMark size={56} />
        </View>

        <Text style={styles.wordmark}>
          Still<Text style={styles.wordmarkAccent}>Journal</Text>
        </Text>
        <Text style={[type.bodyMuted, styles.tagline]}>
          A calm, private place for your days — text or voice, gently reflected back to you.
        </Text>
      </View>

      <View style={styles.features}>
        {[
          { icon: 'lock-closed-outline' as const, text: 'Private and encrypted, only for you' },
          { icon: 'mic-outline' as const, text: 'Speak or write — transcribed automatically' },
          { icon: 'sparkles-outline' as const, text: 'Gentle weekly and monthly insights' },
        ].map((f) => (
          <View key={f.text} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon} size={18} color={CLAUDE_CLAY} />
            </View>
            <Text style={[type.body, styles.featureText]}>{f.text}</Text>
          </View>
        ))}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', flexGrow: 1 },
  hero: { alignItems: 'center', marginBottom: spacing.xxxl, paddingHorizontal: spacing.md },
  markWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  glow: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: radius.pill,
    backgroundColor: CLAUDE_CLAY,
    opacity: 0.14,
  },
  wordmark: {
    fontFamily: type.greeting.fontFamily,
    fontSize: 32,
    lineHeight: 38,
    color: colors.text,
  },
  wordmarkAccent: { color: CLAUDE_CLAY },
  tagline: { textAlign: 'center', marginTop: spacing.md, maxWidth: 320 },
  features: { gap: spacing.lg, paddingHorizontal: spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1 },
  legal: { textAlign: 'center', marginTop: spacing.md, color: colors.mutedText },
});
