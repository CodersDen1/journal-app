import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

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
          message="Nothing found for what you typed. Try another word."
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
  hintWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  hint: {
    textAlign: 'center',
  },
});
