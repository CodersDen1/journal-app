import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '../theme';
import { BrandMark, CLAUDE_CLAY } from './BrandMark';

/**
 * Calm animated launch screen: a warm clay sunburst blooms in behind the
 * "StillJournal" wordmark, over the paper background. Uses RN Animated only.
 */
export function AnimatedSplash() {
  const mark = useRef(new Animated.Value(0)).current; // scale + fade of the mark
  const text = useRef(new Animated.Value(0)).current; // wordmark + tagline
  const glow = useRef(new Animated.Value(0)).current; // pulsing halo

  useEffect(() => {
    Animated.sequence([
      Animated.spring(mark, { toValue: 1, useNativeDriver: true, friction: 6, tension: 40 }),
      Animated.timing(text, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [mark, text, glow]);

  const markStyle = {
    opacity: mark,
    transform: [
      { scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
      { rotate: mark.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) },
    ],
  };
  const glowStyle = {
    opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.28] }),
    transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) }],
  };
  const textStyle = {
    opacity: text,
    transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <View style={styles.markWrap}>
          <Animated.View style={[styles.glow, glowStyle]} />
          <Animated.View style={markStyle}>
            <BrandMark size={64} />
          </Animated.View>
        </View>

        <Animated.View style={[styles.textWrap, textStyle]}>
          <Text style={styles.wordmark}>
            Still<Text style={styles.wordmarkAccent}>Journal</Text>
          </Text>
          <Text style={[type.bodyMuted, styles.tagline]}>A quiet place to write</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center' },
  markWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  glow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: radius.pill,
    backgroundColor: CLAUDE_CLAY,
  },
  textWrap: { alignItems: 'center' },
  wordmark: {
    fontFamily: type.greeting.fontFamily,
    fontSize: 34,
    lineHeight: 40,
    color: colors.text,
    letterSpacing: 0.2,
  },
  wordmarkAccent: { color: CLAUDE_CLAY },
  tagline: { marginTop: spacing.sm },
});
