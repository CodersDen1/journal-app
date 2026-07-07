import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { entryPreview, formatDuration } from '../lib/format';
import { colors, radius, shadow, spacing, type } from '../theme';
import type { JournalEntry } from '../types';

interface TimelineEntryCardProps {
  entry: JournalEntry;
  onPress: () => void;
}

/** Static bar heights for the voice waveform (purely decorative). */
const WAVE = [8, 14, 20, 12, 24, 16, 10, 22, 14, 18, 10, 16, 8, 20, 12, 18, 10];

/**
 * An entry as it appears on the day timeline. Three compact layouts — voice
 * (label + duration + waveform), photo + text (thumbnail beside a preview), and
 * text (label + preview). Tapping opens the entry for editing.
 */
export function TimelineEntryCard({ entry, onPress }: TimelineEntryCardProps) {
  const isVoice = entry.type === 'voice';
  const hasPhotos = entry.photos.length > 0;
  const preview = entryPreview(entry.text, entry.transcript) || 'Untitled entry';

  const label = isVoice ? 'Voice note' : hasPhotos ? 'Photo + text' : 'Text';
  const accessibilityLabel = `Edit ${label.toLowerCase()} entry`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {isVoice ? (
        <>
          <View style={styles.headerRow}>
            <View style={styles.labelWrap}>
              <Ionicons name="mic" size={16} color={colors.primary} />
              <Text style={styles.voiceLabel}>Voice note</Text>
            </View>
            <Text style={styles.duration}>{formatDuration(entry.audioDuration)}</Text>
          </View>
          <View style={styles.wave}>
            {WAVE.map((h, i) => (
              <View key={i} style={[styles.waveBar, { height: h }]} />
            ))}
          </View>
        </>
      ) : hasPhotos ? (
        <View style={styles.photoRow}>
          <Image source={{ uri: entry.photos[0] }} style={styles.thumb} />
          <View style={styles.photoCol}>
            <View style={styles.labelWrap}>
              <Ionicons name="document-text-outline" size={15} color={colors.mutedText} />
              <Text style={styles.mutedLabel}>Photo + text</Text>
            </View>
            <Text style={[type.readingPreview, styles.preview]} numberOfLines={2}>
              {preview}
            </Text>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.labelWrap}>
            <Ionicons name="document-text-outline" size={15} color={colors.mutedText} />
            <Text style={styles.mutedLabel}>Text</Text>
          </View>
          <Text style={[type.readingPreview, styles.preview]} numberOfLines={2}>
            {preview}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  pressed: { opacity: 0.92 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  voiceLabel: { ...type.label, color: colors.text },
  mutedLabel: { ...type.caption, color: colors.mutedText },
  duration: { ...type.label, color: colors.text },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 24,
    marginTop: spacing.md,
  },
  waveBar: {
    width: 2.5,
    borderRadius: radius.pill,
    backgroundColor: colors.mutedText,
    opacity: 0.5,
  },
  photoRow: { flexDirection: 'row', gap: spacing.md },
  photoCol: { flex: 1, gap: spacing.xs },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.softSurface,
  },
  preview: { color: colors.text, marginTop: spacing.xs },
});
