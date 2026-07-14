import { Ionicons } from '@expo/vector-icons';
import { useRoute, type RouteProp } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppShell, IconButton, ScreenHeader } from '../components';
import { api } from '../lib/api';
import { createId, formatRelativeDay } from '../lib/format';
import { askPeriod, entriesInPeriod, type AskScope } from '../lib/period';
import { useAppNavigation } from '../navigation/useAppNavigation';
import type { RootStackParamList } from '../navigation/types';
import { useJournals } from '../state/JournalsContext';
import { colors, radius, shadow, spacing, type } from '../theme';
import type { AskCitation, AskMessage } from '../types';

/** One rendered turn. `error` turns are local — they are never sent back as history. */
type Bubble =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      text: string;
      citations: AskCitation[];
      followUps: string[];
      truncated: boolean;
    }
  | { id: string; role: 'error'; text: string };

/** Openers, per scope — concrete enough to show what the feature can actually do. */
const OPENERS: Record<AskScope, string[]> = {
  week: [
    'What did I keep coming back to?',
    'How did this week actually feel?',
    'What wore me out?',
  ],
  month: [
    'What changed for me this month?',
    'What did I keep putting off?',
    'When was I hardest on myself?',
  ],
  all: [
    'When did I last write about my family?',
    'What was I anxious about last spring?',
    'Have I gotten better at anything?',
  ],
};

const SCOPES: { label: string; value: AskScope }[] = [
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'All time', value: 'all' },
];

/**
 * Ask your journal — a conversation grounded in the user's own entries for a
 * chosen week, month, or their whole history.
 *
 * Threads are kept per period (`week:0`, `month:2`, …) so stepping back to an
 * earlier week and returning does not throw away what was already asked. The
 * server holds no conversation state: prior turns are replayed on every call.
 */
export function AskScreen() {
  const navigation = useAppNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Ask'>>();
  const { entries } = useJournals();

  const [scope, setScope] = useState<AskScope>(route.params?.scope ?? 'week');
  const [offset, setOffset] = useState(0);
  const [threads, setThreads] = useState<Record<string, Bubble[]>>({});
  const [draft, setDraft] = useState(route.params?.question ?? '');
  const [pending, setPending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const period = useMemo(() => askPeriod(scope, offset), [scope, offset]);
  const inPeriod = useMemo(() => entriesInPeriod(entries, period), [entries, period]);
  const threadKey = `${scope}:${offset}`;
  const thread = threads[threadKey] ?? [];

  const isEmptyPeriod = inPeriod.length === 0;
  const canStepForward = offset > 0;
  const steppable = scope !== 'all';

  const append = useCallback(
    (key: string, bubble: Bubble) => {
      setThreads((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), bubble] }));
      // Let the new bubble lay out before chasing it.
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    [],
  );

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || pending || isEmptyPeriod) return;

      // Capture the thread this question belongs to: the user may switch periods
      // while the answer is in flight, and the reply must land where it was asked.
      const key = threadKey;
      const history: AskMessage[] = (threads[key] ?? [])
        .filter((b): b is Extract<Bubble, { role: 'user' | 'assistant' }> => b.role !== 'error')
        .map((b) => ({ role: b.role, text: b.text }));

      setDraft('');
      setPending(true);
      append(key, { id: createId(), role: 'user', text: question });

      try {
        const answer = await api.ask({
          question,
          scope,
          from: period.from,
          to: period.to,
          history,
        });
        append(key, {
          id: createId(),
          role: 'assistant',
          text: answer.answer,
          citations: answer.citations ?? [],
          followUps: answer.followUps ?? [],
          truncated: answer.truncated,
        });
      } catch {
        append(key, {
          id: createId(),
          role: 'error',
          text: 'I could not reach your journal just now. Try asking again in a moment.',
        });
      } finally {
        setPending(false);
      }
    },
    [append, isEmptyPeriod, pending, period.from, period.to, scope, threadKey, threads],
  );

  const changeScope = (next: AskScope) => {
    setScope(next);
    setOffset(0);
  };

  const header = (
    <ScreenHeader
      title="Ask your journal"
      subtitle={`${period.label} · ${inPeriod.length} ${inPeriod.length === 1 ? 'entry' : 'entries'}`}
      onBack={() => navigation.goBack()}
    />
  );

  const composer = (
    <View style={styles.composer}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={isEmptyPeriod ? 'Nothing written in this period' : 'Ask about this period…'}
        placeholderTextColor={colors.mutedText}
        multiline
        editable={!isEmptyPeriod}
        maxLength={500}
        onSubmitEditing={() => void send(draft)}
        style={[type.body, styles.input]}
      />
      <IconButton
        name="arrow-up"
        variant="surface"
        color={colors.onPrimary}
        size={20}
        onPress={() => void send(draft)}
        disabled={pending || isEmptyPeriod || draft.trim() === ''}
        accessibilityLabel="Ask"
        style={styles.sendButton}
      />
    </View>
  );

  return (
    <AppShell header={header} footer={composer} padded={false}>
      <View style={styles.controls}>
        <View style={styles.scopeRow}>
          {SCOPES.map((option) => {
            const selected = option.value === scope;
            return (
              <Pressable
                key={option.value}
                onPress={() => changeScope(option.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.scopeChip, selected && styles.scopeChipSelected]}
              >
                <Text style={[type.label, styles.scopeLabel, selected && styles.scopeLabelSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {steppable ? (
          <View style={styles.stepper}>
            <IconButton
              name="chevron-back"
              size={20}
              onPress={() => setOffset((o) => o + 1)}
              accessibilityLabel={`Earlier ${scope}`}
            />
            <Text style={[type.label, styles.stepperLabel]} numberOfLines={1}>
              {period.label}
            </Text>
            <IconButton
              name="chevron-forward"
              size={20}
              onPress={() => setOffset((o) => Math.max(0, o - 1))}
              disabled={!canStepForward}
              accessibilityLabel={`Later ${scope}`}
            />
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {thread.length === 0 ? (
          <Opening
            scope={scope}
            emptyPeriod={isEmptyPeriod}
            periodLabel={period.label}
            onPick={(question) => void send(question)}
          />
        ) : null}

        {thread.map((bubble) => (
          <Turn
            key={bubble.id}
            bubble={bubble}
            onOpenEntry={(entryId) => navigation.navigate('JournalDetail', { entryId })}
            onFollowUp={(question) => void send(question)}
          />
        ))}

        {pending ? (
          <View style={styles.thinking}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={type.bodyMuted}>Reading what you wrote…</Text>
          </View>
        ) : null}
      </ScrollView>
    </AppShell>
  );
}

/** The blank state: what this is, and three questions worth tapping. */
function Opening({
  scope,
  emptyPeriod,
  periodLabel,
  onPick,
}: {
  scope: AskScope;
  emptyPeriod: boolean;
  periodLabel: string;
  onPick: (question: string) => void;
}) {
  if (emptyPeriod) {
    return (
      <View style={styles.opening}>
        <Ionicons name="moon-outline" size={28} color={colors.mutedText} />
        <Text style={[type.reading, styles.openingTitle]}>Nothing written yet</Text>
        <Text style={[type.bodyMuted, styles.openingText]}>
          There are no entries in {periodLabel.toLowerCase()}. Step back to another period, or write
          something first.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.opening}>
      <Ionicons name="sparkles-outline" size={28} color={colors.primary} />
      <Text style={[type.reading, styles.openingTitle]}>Ask anything about what you wrote</Text>
      <Text style={[type.bodyMuted, styles.openingText]}>
        Answers come only from your own entries, and every one points back to where it came from.
      </Text>

      <View style={styles.chips}>
        {OPENERS[scope].map((question) => (
          <Pressable
            key={question}
            onPress={() => onPick(question)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <Text style={[type.body, styles.chipText]}>{question}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** One turn: the question, the grounded answer, its citations and follow-ups. */
function Turn({
  bubble,
  onOpenEntry,
  onFollowUp,
}: {
  bubble: Bubble;
  onOpenEntry: (entryId: string) => void;
  onFollowUp: (question: string) => void;
}) {
  if (bubble.role === 'user') {
    return (
      <View style={styles.userBubble}>
        <Text style={[type.body, styles.userText]}>{bubble.text}</Text>
      </View>
    );
  }

  if (bubble.role === 'error') {
    return (
      <View style={styles.errorBubble}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.secondary} />
        <Text style={[type.bodyMuted, styles.errorText]}>{bubble.text}</Text>
      </View>
    );
  }

  return (
    <View style={styles.answer}>
      <Text style={type.reading}>{bubble.text}</Text>

      {bubble.citations.length > 0 ? (
        <View style={styles.citations}>
          <Text style={[type.overline, styles.citationsTitle]}>From your entries</Text>
          {bubble.citations.map((citation) => (
            <Pressable
              key={citation.entryId}
              onPress={() => onOpenEntry(citation.entryId)}
              accessibilityRole="button"
              accessibilityLabel={`Open the entry from ${formatRelativeDay(citation.date)}`}
              style={({ pressed }) => [styles.citation, pressed && styles.chipPressed]}
            >
              <View style={styles.citationHeader}>
                <Text style={type.caption}>{formatRelativeDay(citation.date)}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.mutedText} />
              </View>
              {citation.quote ? (
                <Text style={[type.readingPreview, styles.quote]} numberOfLines={3}>
                  “{citation.quote}”
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {bubble.truncated ? (
        <Text style={[type.caption, styles.truncated]}>
          This period holds a lot of writing — I read the most recent entries in it.
        </Text>
      ) : null}

      {bubble.followUps.length > 0 ? (
        <View style={styles.chips}>
          {bubble.followUps.map((question) => (
            <Pressable
              key={question}
              onPress={() => onFollowUp(question)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={[type.body, styles.chipText]}>{question}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  controls: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  scopeRow: {
    flexDirection: 'row',
    backgroundColor: colors.softSurface,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  scopeChip: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeChipSelected: {
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  scopeLabel: { color: colors.mutedText },
  scopeLabelSelected: { color: colors.text },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperLabel: { flex: 1, textAlign: 'center', color: colors.mutedText },

  thread: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },

  opening: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  openingTitle: { textAlign: 'center' },
  openingText: { textAlign: 'center', paddingHorizontal: spacing.md },

  chips: { gap: spacing.sm, marginTop: spacing.sm, alignSelf: 'stretch' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  chipPressed: { opacity: 0.6 },
  chipText: { color: colors.primaryDark },

  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  userText: { color: colors.onPrimary },

  answer: { gap: spacing.md },

  citations: { gap: spacing.sm },
  citationsTitle: { marginTop: spacing.xs },
  citation: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  citationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quote: { color: colors.mutedText },

  truncated: { fontStyle: 'italic' },

  errorBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.softSurface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1 },

  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  input: {
    flex: 1,
    color: colors.text,
    maxHeight: 120,
    paddingVertical: spacing.md,
  },
  sendButton: {
    backgroundColor: colors.primary,
    minWidth: 40,
    minHeight: 40,
    marginBottom: 2,
  },
});
