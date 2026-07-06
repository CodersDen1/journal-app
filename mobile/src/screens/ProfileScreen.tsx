import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppShell, ScreenHeader, SettingRow } from '../components';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useAuth } from '../state/AuthContext';
import { useProfile } from '../state/ProfileContext';
import { colors, radius, spacing, type } from '../theme';
import type { ReminderRhythm } from '../types';

function reminderRhythmLabel(rhythm: ReminderRhythm): string {
  switch (rhythm) {
    case 'off':
      return 'Off';
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    case 'custom':
      return 'Custom';
  }
}

/** A grouped card surface holding SettingRow children. */
function Group({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

/** An overline section label preceding a group. */
function SectionLabel({ children }: { children: string }) {
  return <Text style={[type.overline, styles.sectionLabel]}>{children}</Text>;
}

export function ProfileScreen() {
  const navigation = useAppNavigation();
  const { profile, update } = useProfile();
  const { user, signOut } = useAuth();

  const signedIn = Boolean(user);

  return (
    <AppShell scroll header={<ScreenHeader title="Profile" onBack={navigation.goBack} />}>
      <SectionLabel>Account</SectionLabel>
      <Group>
        <SettingRow
          label="Account"
          value={profile.accountEmail ?? undefined}
          icon="person-circle-outline"
        />
        <SettingRow label="Plan" value={profile.plan === 'plus' ? 'Still Plus' : 'Free'} last />
      </Group>

      {profile.plan === 'free' ? (
        <Pressable
          onPress={() => navigation.navigate('Paywall')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.upgradeCard, pressed && styles.pressed]}
        >
          <Ionicons name="sparkles-outline" size={24} color={colors.primary} />
          <View style={styles.upgradeText}>
            <Text style={type.heading}>Still Plus</Text>
            <Text style={[type.bodyMuted, styles.upgradeSubtitle]}>
              Deeper insights, backup, and app lock
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
        </Pressable>
      ) : null}

      <SectionLabel>Privacy</SectionLabel>
      <Group>
        <SettingRow
          label="App lock"
          description="Require Face ID or passcode"
          right={
            <Switch
              value={profile.appLockEnabled}
              onValueChange={(v) => update({ appLockEnabled: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          }
        />
        <SettingRow
          label="Backup"
          description="Encrypted backup to your account"
          right={
            <Switch
              value={profile.backupEnabled}
              onValueChange={(v) => update({ backupEnabled: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          }
          last
        />
      </Group>

      <SectionLabel>Journaling</SectionLabel>
      <Group>
        <SettingRow
          label="Default entry mode"
          value={profile.defaultEntryMode === 'voice' ? 'Voice' : 'Text'}
          onPress={() =>
            update({ defaultEntryMode: profile.defaultEntryMode === 'text' ? 'voice' : 'text' })
          }
        />
        <SettingRow label="Transcription language" value={profile.transcriptionLanguage} />
        <SettingRow label="Text-to-speech voice" value={profile.textToSpeechVoice} last />
      </Group>

      <SectionLabel>Reminders</SectionLabel>
      <Group>
        <SettingRow
          label="Reminder rhythm"
          value={reminderRhythmLabel(profile.reminderRhythm)}
          onPress={() => navigation.navigate('ReminderRhythm')}
        />
        <SettingRow
          label="Nudge if I miss yesterday"
          right={
            <Switch
              value={profile.missedYesterdayNudge}
              onValueChange={(v) => update({ missedYesterdayNudge: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          }
          last
        />
      </Group>

      {signedIn ? (
        <Group>
          <SettingRow label="Sign out" destructive onPress={() => void signOut()} last />
        </Group>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  upgradeCard: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  upgradeText: { flex: 1 },
  upgradeSubtitle: { marginTop: 2 },
  pressed: { opacity: 0.6 },
});
