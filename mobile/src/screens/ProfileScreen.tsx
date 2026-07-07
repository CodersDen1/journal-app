import React from 'react';
import { Alert, Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { AppShell, ScreenHeader, SettingRow } from '../components';
import { formatFullDate } from '../lib/format';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useAuth } from '../state/AuthContext';
import { useEntitlement } from '../state/EntitlementContext';
import { useProfile } from '../state/ProfileContext';
import { colors, radius, spacing, type } from '../theme';
import type { Entitlement, ReminderRhythm } from '../types';

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

/** A "Renews on …" style status line derived from the entitlement. */
function subscriptionDetail(ent: Entitlement | null): { label: string; value: string } | null {
  if (!ent || !ent.active) return null;
  const date = ent.expiresAt ? formatFullDate(ent.expiresAt) : '';
  if (ent.isTrial) return { label: 'Free trial ends', value: date };
  if (ent.willRenew) return { label: 'Renews', value: date };
  if (date) return { label: 'Expires', value: date };
  return null;
}

export function ProfileScreen() {
  const navigation = useAppNavigation();
  const { profile, update } = useProfile();
  const { user, signOut } = useAuth();
  const { entitlement, restore } = useEntitlement();

  const signedIn = Boolean(user);
  const detail = subscriptionDetail(entitlement);
  const isPro = entitlement?.active || profile.plan === 'pro';

  const onRestore = async () => {
    try {
      await restore();
      Alert.alert('Restore complete', 'Your subscription is up to date.');
    } catch {
      Alert.alert('Nothing to restore', "We couldn't find a subscription for this account.");
    }
  };

  const onManage = () => {
    const url = Platform.select({
      ios: 'https://apps.apple.com/account/subscriptions',
      android: 'https://play.google.com/store/account/subscriptions',
      default: 'https://apps.apple.com/account/subscriptions',
    });
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open', 'Manage your subscription from the App Store or Google Play.'),
    );
  };

  return (
    <AppShell scroll header={<ScreenHeader title="Profile" onBack={navigation.goBack} />}>
      <SectionLabel>Account</SectionLabel>
      <Group>
        <SettingRow
          label="Account"
          value={profile.accountEmail ?? undefined}
          icon="person-circle-outline"
          last
        />
      </Group>

      <SectionLabel>Subscription</SectionLabel>
      <Group>
        <SettingRow label="Plan" value={isPro ? 'Still Pro' : 'Free'} />
        {detail ? <SettingRow label={detail.label} value={detail.value} /> : null}
        <SettingRow label="Restore purchases" onPress={() => void onRestore()} />
        <SettingRow label="Manage subscription" onPress={onManage} last />
      </Group>

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
});
