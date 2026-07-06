import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppShell, EmptyState, IconButton, PrimaryButton, ScreenHeader, SegmentedControl } from '../components';
import { mockInsights } from '../data/mockInsights';
import { api } from '../lib/api';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useAuth } from '../state/AuthContext';
import { useJournals } from '../state/JournalsContext';
import { colors, radius, spacing, type } from '../theme';
import type { InsightDigest, InsightPeriod } from '../types';

export function InsightsScreen() {
  const navigation = useAppNavigation();
  const { activeEntries } = useJournals();
  const { user } = useAuth();
  const [period, setPeriod] = useState<InsightPeriod>('weekly');
  const [digests, setDigests] = useState<Partial<Record<InsightPeriod, InsightDigest>>>({});
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  const enoughEntries = activeEntries.length >= 3;

  const load = useCallback(
    async (p: InsightPeriod, force: boolean) => {
      setLoading(true);
      setNote('');
      try {
        if (!user) {
          // Signed out: local reflection only.
          setDigests((prev) => ({ ...prev, [p]: mockInsights[p] }));
          setNote('Sign in to generate insights from your own entries.');
          return;
        }
        // Signed in: regenerate from real entries (Gemini), or fetch the last one.
        const result = force ? await api.generateInsight(p) : await api.insights(p);
        setDigests((prev) => ({ ...prev, [p]: result }));
      } catch {
        // Fall back to the stored digest, then to the local sample.
        try {
          const stored = await api.insights(p);
          setDigests((prev) => ({ ...prev, [p]: stored }));
        } catch {
          setDigests((prev) => ({ ...prev, [p]: mockInsights[p] }));
          setNote('Showing a sample — insights will refresh when the server is reachable.');
        }
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  // Generate on first view of each period (from the user's entries when signed in).
  useEffect(() => {
    if (!enoughEntries) return;
    if (!digests[period]) void load(period, Boolean(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, enoughEntries, user]);

  const digest = digests[period];

  const header = (
    <ScreenHeader
      title="Insights"
      large
      right={
        enoughEntries && user ? (
          <IconButton
            name="refresh"
            onPress={() => load(period, true)}
            accessibilityLabel="Refresh insight"
            disabled={loading}
          />
        ) : undefined
      }
    />
  );

  if (!enoughEntries) {
    return (
      <AppShell header={header}>
        <EmptyState
          icon="sparkles-outline"
          title="Insights arrive with time"
          message="Write a few more entries and Still will begin to notice gentle patterns in how your days feel."
        />
      </AppShell>
    );
  }

  return (
    <AppShell header={header} scroll>
      <SegmentedControl
        options={[
          { label: 'Weekly', value: 'weekly' },
          { label: 'Monthly', value: 'monthly' },
        ]}
        value={period}
        onChange={(v) => setPeriod(v as InsightPeriod)}
      />

      {loading && !digest ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.bodyMuted, styles.loadingText]}>Reflecting on your entries…</Text>
        </View>
      ) : digest ? (
        <>
          <View style={styles.metaRow}>
            <Text style={type.caption}>{digest.periodLabel}</Text>
            {loading ? <Text style={type.caption}>Refreshing…</Text> : null}
          </View>

          <View style={styles.summaryCard}>
            <Text style={type.reading}>{digest.summary}</Text>
          </View>

          {digest.patterns.length > 0 ? (
            <View style={styles.section}>
              <Text style={[type.overline, styles.sectionTitle]}>Patterns</Text>
              {digest.patterns.map((pattern) => (
                <View key={pattern} style={styles.bulletRow}>
                  <Ionicons name="ellipse" size={6} color={colors.primary} style={styles.bullet} />
                  <Text style={[type.body, styles.bulletText]}>{pattern}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {digest.emotionalTone ? (
            <View style={styles.section}>
              <Text style={[type.overline, styles.sectionTitle]}>Emotional tone</Text>
              <View style={styles.chip}>
                <Text style={type.label}>{digest.emotionalTone}</Text>
              </View>
            </View>
          ) : null}

          {digest.recommendations.length > 0 ? (
            <View style={styles.section}>
              <Text style={[type.overline, styles.sectionTitle]}>A gentle suggestion</Text>
              {digest.recommendations.map((rec) => (
                <View key={rec} style={styles.recommendationRow}>
                  <Ionicons name="leaf-outline" size={18} color={colors.primary} style={styles.leaf} />
                  <Text style={[type.body, styles.bulletText]}>{rec}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {digest.suggestedPrompt ? (
            <View style={[styles.section, styles.promptCard]}>
              <Text style={[type.overline, styles.sectionTitle]}>Try writing about</Text>
              <Text style={[type.reading, styles.promptText]}>{digest.suggestedPrompt}</Text>
              <PrimaryButton
                variant="secondary"
                label="Write about this"
                onPress={() => navigation.navigate('CreateJournal', { mode: 'text' })}
              />
            </View>
          ) : null}

          {note ? <Text style={[type.caption, styles.note]}>{note}</Text> : null}
        </>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  loadingText: {},
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: { marginTop: spacing.xl },
  sectionTitle: { marginBottom: spacing.md },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  bullet: { marginTop: spacing.sm, marginRight: spacing.md },
  bulletText: { flex: 1 },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.softSurface,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  recommendationRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  leaf: { marginTop: spacing.xs, marginRight: spacing.md },
  promptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  promptText: { marginBottom: spacing.lg },
  note: { marginTop: spacing.xl, textAlign: 'center', color: colors.mutedText },
});
