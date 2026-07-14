import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppShell, EmptyState, IconButton, JournalCard } from '../components';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useJournals } from '../state/JournalsContext';
import { colors, radius, spacing, type } from '../theme';

export function SearchScreen() {
  const navigation = useAppNavigation();
  const { search } = useJournals();
  const [query, setQuery] = useState('');

  const trimmed = query.trim();
  const results = trimmed ? search(query) : [];

  const header = (
    <View style={styles.headerRow}>
      <IconButton
        name="chevron-back"
        onPress={() => navigation.goBack()}
        accessibilityLabel="Close search"
      />
      <View style={styles.searchField}>
        <Ionicons name="search-outline" size={18} color={colors.mutedText} />
        <TextInput
          autoFocus
          placeholder="Search your journal"
          placeholderTextColor={colors.mutedText}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          style={[type.body, styles.input]}
        />
      </View>
    </View>
  );

  // Search matches words; Ask answers questions. Whatever they typed is the best
  // possible seed for a question, so offer the hand-off right where they typed it.
  const askAboutQuery = () => navigation.navigate('Ask', { question: trimmed, scope: 'all' });

  const askRow = (
    <Pressable
      onPress={askAboutQuery}
      accessibilityRole="button"
      accessibilityLabel={`Ask your journal about ${trimmed}`}
      style={({ pressed }) => [styles.askRow, pressed && styles.askRowPressed]}
    >
      <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
      <View style={styles.askCopy}>
        <Text style={type.label} numberOfLines={1}>
          Ask “{trimmed}”
        </Text>
        <Text style={type.caption}>Get an answer drawn from your entries</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
    </Pressable>
  );

  const renderBody = () => {
    if (!trimmed) {
      return (
        <View style={styles.hintWrap}>
          <Text style={[type.bodyMuted, styles.hint]}>
            Search across everything you have written.
          </Text>
        </View>
      );
    }

    if (results.length === 0) {
      return (
        <EmptyState
          icon="search-outline"
          title="No matches"
          message="No entry contains those words — but you can still ask about them."
          action={{ label: 'Ask your journal', onPress: askAboutQuery }}
        />
      );
    }

    return (
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={askRow}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <JournalCard
            entry={item}
            onPress={() => navigation.navigate('JournalDetail', { entryId: item.id })}
          />
        )}
      />
    );
  };

  return (
    <AppShell header={header} padded={false}>
      {renderBody()}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.softSurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingVertical: 0,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  separator: { height: spacing.md },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  askRowPressed: { opacity: 0.6 },
  askCopy: { flex: 1, gap: 2 },
  hintWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  hint: {
    textAlign: 'center',
  },
});
