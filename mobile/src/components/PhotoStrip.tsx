import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '../theme';

interface PhotoStripProps {
  photos: string[];
  /** Thumbnail edge length. Default 56 (small — photos stay secondary). */
  size?: number;
  /** Max thumbnails before showing a "+N" tile. Default 4. */
  max?: number;
  onPressPhoto?: (index: number) => void;
}

/**
 * A compact horizontal row of photo thumbnails. Used on cards and detail views
 * where photos should stay secondary to the writing.
 */
export function PhotoStrip({ photos, size = 56, max = 4, onPressPhoto }: PhotoStripProps) {
  if (!photos || photos.length === 0) return null;

  const shown = photos.slice(0, max);
  const overflow = photos.length - shown.length;

  return (
    <View style={styles.row}>
      {shown.map((uri, index) => {
        const isLastShown = index === shown.length - 1;
        return (
          <Pressable
            key={`${uri}-${index}`}
            onPress={onPressPhoto ? () => onPressPhoto(index) : undefined}
            style={[styles.thumbWrap, { width: size, height: size }]}
          >
            <Image source={{ uri }} style={styles.image} />
            {overflow > 0 && isLastShown ? (
              <View style={styles.overflow}>
                <Text style={styles.overflowText}>+{overflow}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  thumbWrap: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.softSurface,
  },
  image: { width: '100%', height: '100%' },
  overflow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: { ...type.label, color: colors.onPrimary },
});
