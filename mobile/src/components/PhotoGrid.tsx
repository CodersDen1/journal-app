import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '../theme';

interface PhotoGridProps {
  photos: string[];
  /** Show an "add photo" tile and per-photo remove buttons. */
  editable?: boolean;
  onPressAdd?: () => void;
  onRemove?: (index: number) => void;
  onPressPhoto?: (index: number) => void;
  /** Columns in the grid. Default 3. */
  columns?: number;
}

/**
 * A tidy grid of photos for the detail and compose views. In editable mode it
 * shows an add tile and small remove buttons. Photos never dominate the entry.
 */
export function PhotoGrid({
  photos,
  editable = false,
  onPressAdd,
  onRemove,
  onPressPhoto,
  columns = 3,
}: PhotoGridProps) {
  const gap = spacing.sm;

  const tileStyle = {
    // Percentage width leaves room for gaps between columns.
    width: `${100 / columns}%` as const,
  };

  if (!editable && (!photos || photos.length === 0)) return null;

  return (
    <View style={[styles.grid, { marginHorizontal: -gap / 2 }]}>
      {photos.map((uri, index) => (
        <View key={`${uri}-${index}`} style={[tileStyle, { padding: gap / 2 }]}>
          <Pressable
            onPress={onPressPhoto ? () => onPressPhoto(index) : undefined}
            style={styles.tile}
          >
            <Image source={{ uri }} style={styles.image} />
          </Pressable>
          {editable ? (
            <Pressable
              onPress={() => onRemove?.(index)}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              hitSlop={8}
              style={styles.remove}
            >
              <Ionicons name="close" size={14} color={colors.onPrimary} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {editable ? (
        <View style={[tileStyle, { padding: gap / 2 }]}>
          <Pressable
            onPress={onPressAdd}
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            style={[styles.tile, styles.addTile]}
          >
            <Ionicons name="add" size={26} color={colors.mutedText} />
            <Text style={[type.caption, styles.addLabel]}>Add</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.softSurface,
  },
  image: { width: '100%', height: '100%' },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  addLabel: { marginTop: 2 },
  remove: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
