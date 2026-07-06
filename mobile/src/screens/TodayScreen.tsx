import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell, IconButton, JournalCard, ScreenHeader } from '../components';
import { formatFullDate, greetingForNow } from '../lib/format';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useJournals } from '../state/JournalsContext';
import { colors, radius, spacing, type } from '../theme';

export function TodayScreen() {
  const navigation = useAppNavigation();
  const { activeEntries } = useJournals();

  const recent = activeEntries.slice(0, 3);

  const header = (
    <ScreenHeader
      right={
        <IconButton
          name="person-circle-outline"
          onPress={() => navigation.navigate('Profile')}
          accessibilityLabel="Open profile"
        />
      }
    />
  );

  return (
    <AppShell scroll header={header}>
      <View style={styles.greetingBlock}>
        <Text style={type.greeting}>{greetingForNow()}</Text>
        <Text style={[type.bodyMuted, styles.date]}>
          {formatFullDate(new Date().toISOString())}
        </Text>
      </View>

      <View style={styles.compose}>
        <Pressable
          style={({ pressed }) => [styles.composeCard, pressed && styles.pressed]}
          onPress={() => navigation.navigate('CreateJournal', { mode: 'text' })}
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={26} color={colors.primary} />
          <View style={styles.composeText}>
            <Text style={type.heading}>Write something</Text>
            <Text style={[type.bodyMuted, styles.composeSubtitle]}>
              A few quiet words about today
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.composeCard, pressed && styles.pressed]}
          onPress={() => navigation.navigate('CreateJournal', { mode: 'voice' })}
          accessibilityRole="button"
        >
          <Ionicons name="mic-outline" size={26} color={colors.primary} />
          <View style={styles.composeText}>
            <Text style={type.heading}>Record a voice note</Text>
            <Text style={[type.bodyMuted, styles.composeSubtitle]}>
              Speak your mind, hands free
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.recent}>
        <Text style={[type.overline, styles.recentLabel]}>Recent</Text>
        {recent.length === 0 ? (
          <Text style={type.bodyMuted}>Your entries will appear here.</Text>
        ) : (
          recent.map((entry) => (
            <View key={entry.id} style={styles.recentItem}>
              <JournalCard
                entry={entry}
                onPress={() => navigation.navigate('JournalDetail', { entryId: entry.id })}
              />
            </View>
          ))
        )}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  greetingBlock: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  date: {
    marginTop: spacing.xs,
  },
  compose: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  composeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  composeText: {
    flex: 1,
    gap: spacing.xs,
  },
  composeSubtitle: {
    marginTop: 0,
  },
  pressed: {
    opacity: 0.7,
  },
  recent: {
    gap: spacing.md,
  },
  recentLabel: {
    marginBottom: spacing.xs,
  },
  recentItem: {
    marginBottom: 0,
  },
});
