import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { AppShell, EmptyState, IconButton, JournalCard, ScreenHeader } from '../components';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useJournals } from '../state/JournalsContext';
import { useSnackbar } from '../state/SnackbarContext';
import { colors, radius, spacing, type } from '../theme';
import type { JournalEntry } from '../types';

/** One swipeable row: swipe left to archive, swipe right to delete. */
function SwipeableRow({
  entry,
  onOpenArchive,
  onOpenDelete,
  onPress,
}: {
  entry: JournalEntry;
  onOpenArchive: () => void;
  onOpenDelete: () => void;
  onPress: () => void;
}) {
  const ref = useRef<Swipeable>(null);

  // renderLeftActions is revealed by swiping RIGHT -> delete.
  const renderLeft = () => (
    <View style={[styles.action, styles.deleteAction]}>
      <Ionicons name="trash-outline" size={22} color={colors.onPrimary} />
      <Text style={styles.actionText}>Delete</Text>
    </View>
  );

  // renderRightActions is revealed by swiping LEFT -> archive.
  const renderRight = () => (
    <View style={[styles.action, styles.archiveAction]}>
      <Ionicons name="archive-outline" size={22} color={colors.onPrimary} />
      <Text style={styles.actionText}>Archive</Text>
    </View>
  );

  return (
    <Swipeable
      ref={ref}
      friction={2}
      leftThreshold={72}
      rightThreshold={72}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderLeft}
      renderRightActions={renderRight}
      onSwipeableOpen={(direction) => {
        ref.current?.close();
        if (direction === 'left') onOpenDelete();
        else onOpenArchive();
      }}
    >
      <JournalCard entry={entry} onPress={onPress} />
    </Swipeable>
  );
}

export function JournalsScreen() {
  const navigation = useAppNavigation();
  const { activeEntries, archiveEntry, deleteEntry, restoreEntry } = useJournals();
  const snackbar = useSnackbar();

  const openDetail = (id: string) => navigation.navigate('JournalDetail', { entryId: id });

  const handleArchive = (entry: JournalEntry) => {
    archiveEntry(entry.id);
    snackbar.show({
      message: 'Entry archived',
      actionLabel: 'Undo',
      onAction: () => restoreEntry(entry.id),
    });
  };

  const handleDelete = (entry: JournalEntry) => {
    deleteEntry(entry.id);
    snackbar.show({
      message: 'Entry deleted',
      actionLabel: 'Undo',
      onAction: () => restoreEntry(entry.id),
    });
  };

  const header = (
    <ScreenHeader
      title="Journals"
      large
      right={
        <>
          <IconButton
            name="sparkles-outline"
            onPress={() => navigation.navigate('Ask')}
            accessibilityLabel="Ask your journal"
          />
          <IconButton
            name="search-outline"
            onPress={() => navigation.navigate('Search')}
            accessibilityLabel="Search journals"
          />
        </>
      }
    />
  );

  if (activeEntries.length === 0) {
    return (
      <AppShell header={header}>
        <EmptyState
          icon="book-outline"
          title="Nothing here yet"
          message="Your entries will gather here. Start with a few quiet words about today."
          action={{ label: 'Start writing', onPress: () => navigation.navigate('CreateJournal', { mode: 'text' }) }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell header={header} padded={false}>
      <FlatList
        data={activeEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <SwipeableRow
            entry={item}
            onPress={() => openDetail(item.id)}
            onOpenArchive={() => handleArchive(item)}
            onOpenDelete={() => handleDelete(item)}
          />
        )}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  separator: { height: spacing.md },
  action: {
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    width: 96,
    gap: 4,
  },
  deleteAction: { backgroundColor: colors.recording, alignItems: 'flex-start', paddingLeft: spacing.lg },
  archiveAction: { backgroundColor: colors.primary, alignItems: 'flex-end', paddingRight: spacing.lg },
  actionText: { ...type.caption, color: colors.onPrimary },
});
