import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '../lib/format';
import { colors, radius, spacing, type } from '../theme';

interface AudioPlayerProps {
  audioUri: string | null;
  durationSeconds: number;
  /** Optional HTTP headers for a remote source (e.g. auth for the TTS URL). */
  headers?: Record<string, string>;
}

/**
 * Inline audio player for voice entries. Plays a real recording when audioUri
 * is present; otherwise renders a calm, static player (used for seeded/mock
 * voice entries where only the duration is known).
 */
export function AudioPlayer({ audioUri, durationSeconds, headers }: AudioPlayerProps) {
  const player = useAudioPlayer(audioUri ? { uri: audioUri, headers } : null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    // Allow playback even when the iOS ringer switch is silent.
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const playable = Boolean(audioUri);
  const isPlaying = status.playing;
  const position = status.currentTime ?? 0;
  const total = status.duration && status.duration > 0 ? status.duration : durationSeconds || 0;
  const progress = total > 0 ? Math.min(1, position / total) : 0;

  const togglePlayback = () => {
    if (!playable) return;
    if (isPlaying) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (total > 0 && position >= total)) {
      void player.seekTo(0);
    }
    player.play();
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={togglePlayback}
        disabled={!playable}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        style={({ pressed }) => [
          styles.playButton,
          pressed && playable && styles.pressed,
          !playable && styles.playDisabled,
        ]}
      >
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color={colors.onPrimary} />
      </Pressable>

      <View style={styles.body}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.times}>
          <Text style={type.caption}>{formatDuration(position)}</Text>
          <Text style={type.caption}>{formatDuration(total)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.softSurface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  playDisabled: { backgroundColor: colors.primary, opacity: 0.5 },
  pressed: { opacity: 0.85 },
  body: { flex: 1 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.primary },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
});
