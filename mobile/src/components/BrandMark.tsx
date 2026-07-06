import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Claude's warm clay/coral tint — used only for brand moments (splash, login). */
export const CLAUDE_CLAY = '#CC785C';

interface BrandMarkProps {
  size?: number;
  color?: string;
}

/**
 * A small 12-spoke sunburst mark (a calm nod to Claude), drawn from rotated
 * rounded bars so it needs no image asset.
 */
export function BrandMark({ size = 48, color = CLAUDE_CLAY }: BrandMarkProps) {
  const barWidth = Math.max(3, size * 0.13);
  const rotations = [0, 30, 60, 90, 120, 150];
  return (
    <View style={{ width: size, height: size }}>
      {rotations.map((deg) => (
        <View
          key={deg}
          style={[
            styles.bar,
            {
              width: barWidth,
              height: size,
              left: (size - barWidth) / 2,
              borderRadius: barWidth / 2,
              backgroundColor: color,
              transform: [{ rotate: `${deg}deg` }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0 },
});
