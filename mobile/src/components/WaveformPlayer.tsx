import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';

// A calm, static bar pattern. While playing, each bar animates a scaleY
// "equalizer" over it; bars also fill left-to-right with playback progress.
const BARS = [10, 18, 28, 20, 34, 24, 40, 30, 22, 36, 16, 28, 42, 26, 18, 30, 22, 34, 14, 24];
const UNPLAYED = 'rgba(154, 79, 63, 0.25)';
// Leave a clear gap in the middle for the floating play/pause glyph.
const MID = Math.floor(BARS.length / 2);

interface WaveformPlayerProps {
  playing: boolean;
  /** 0..1 playback progress; fills the bars left-to-right. */
  progress: number;
  onToggle: () => void;
}

/**
 * The recorded-clip control: a waveform with a translucent play/pause button
 * floating over its centre. The bars react to playback — an animated equalizer
 * while playing, and a left-to-right fill tracking position.
 */
export function WaveformPlayer({ playing, progress, onToggle }: WaveformPlayerProps) {
  // One animated scale per bar; 1 = full height (resting), <1 = dipped.
  const anims = useRef(BARS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (!playing) {
      anims.forEach((a) => a.stopAnimation());
      Animated.parallel(
        anims.map((a) => Animated.timing(a, { toValue: 1, duration: 220, useNativeDriver: true })),
      ).start();
      return;
    }
    // Staggered loop so the bars ripple rather than pulse in unison.
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((i % 6) * 70),
          Animated.timing(a, { toValue: 0.4, duration: 340, useNativeDriver: true }),
          Animated.timing(a, { toValue: 1, duration: 340, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [playing, anims]);

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause recording' : 'Play recording'}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View style={styles.bars}>
        {BARS.map((h, i) => {
          const played = progress > 0 && (i + 0.5) / BARS.length <= progress;
          return (
            <React.Fragment key={i}>
              {i === MID ? <View style={styles.buttonGap} /> : null}
              <Animated.View
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: played ? colors.recording : UNPLAYED,
                    transform: [{ scaleY: anims[i] }],
                  },
                ]}
              />
            </React.Fragment>
          );
        })}
      </View>

      {/* Bare play/pause glyph floating over the wave — no backdrop, blended in. */}
      <View style={styles.overlay} pointerEvents="none">
        <Ionicons
          name={playing ? 'pause' : 'play'}
          size={30}
          color={colors.recording}
          style={playing ? undefined : styles.playGlyph}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.9 },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
    gap: 4,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
  buttonGap: { width: 64 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { marginLeft: 2 }, // optical centering for the play triangle
});
