import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { entryPreview, formatDuration, formatRelativeDay, formatTime } from '../lib/format';
import { colors, radius, shadow, spacing, type } from '../theme';
import type { JournalEntry } from '../types';
import { PhotoStrip } from './PhotoStrip';

interface JournalCardProps {
  entry: JournalEntry;
  onPress: () => void;
}

/**
 * A single entry in a list. Medium is shown with icons only (never the words
 * "Text"/"Voice"). Voice entries show their length. Photos stay small and
 * secondary. Spacing is generous — cards must never feel cramped.
 */
export function JournalCard({ entry, onPress }: JournalCardProps) {
  const isVoice = entry.type === 'voice';
  const preview = entryPreview(entry.text, entry.transcript) || 'Untitled entry';
  const hasPhotos = entry.photos.length > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Journal entry from ${formatRelativeDay(entry.createdAt)}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.metaRow}>
        <Text style={type.caption}>
          {formatRelativeDay(entry.createdAt)} · {formatTime(entry.createdAt)}
        </Text>
        <View style={styles.metaIcons}>
          {entry.favorite ? (
            <Ionicons name="heart" size={15} color={colors.secondary} style={styles.metaIcon} />
          ) : null}
          <Ionicons
            name={isVoice ? 'mic-outline' : 'document-text-outline'}
            size={15}
            color={colors.mutedText}
          />
        </View>
      </View>

      <Text style={[type.readingPreview, styles.preview]} numberOfLines={3}>
        {preview}
      </Text>

      {isVoice || hasPhotos ? (
        <View style={styles.footer}>
          {isVoice ? (
            <View style={styles.duration}>
              <Ionicons name="play" size={12} color={colors.primaryDark} />
              <Text style={[type.caption, styles.durationText]}>{formatDuration(entry.audioDuration)}</Text>
            </View>
          ) : null}
          {hasPhotos ? <PhotoStrip photos={entry.photos} size={44} max={4} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressed: { opacity: 0.92 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  metaIcons: { flexDirection: 'row', alignItems: 'center' },
  metaIcon: { marginRight: spacing.xs },
  preview: { color: colors.text },
  footer: { marginTop: spacing.md, gap: spacing.md },
  duration: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.softSurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  durationText: { marginLeft: spacing.xs, color: colors.primaryDark },
});
