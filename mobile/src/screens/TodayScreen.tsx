import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell, IconButton } from '../components';
import { entryPreview, formatDuration, formatFullDate, formatTime, greetingForNow } from '../lib/format';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useJournals } from '../state/JournalsContext';
import { useProfile } from '../state/ProfileContext';
import { colors, fonts, radius, shadow, spacing, type } from '../theme';
import type { JournalEntry } from '../types';

/** Ignore accidental taps shorter than this (seconds). */
const MIN_HOLD_SECONDS = 0.6;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Sub-line for an activity card: time of day, plus duration for voice notes. */
function entryMeta(entry: JournalEntry): string {
  const time = formatTime(entry.createdAt);
  return entry.type === 'voice' ? `${time} · ${formatDuration(entry.audioDuration)}` : time;
}

/** Title for an activity card: a snippet of its text/transcript. */
function entryTitle(entry: JournalEntry): string {
  const preview = entryPreview(entry.text, entry.transcript);
  if (preview) return preview;
  return entry.type === 'voice' ? 'Voice note' : 'Untitled entry';
}

export function TodayScreen() {
  const navigation = useAppNavigation();
  const { activeEntries } = useJournals();
  const { profile } = useProfile();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);

  const liveDuration = (recorderState.durationMillis ?? 0) / 1000;
  const now = new Date();
  const todayEntries = activeEntries.filter((e) => sameDay(new Date(e.createdAt), now));

  // Show the catch-up nudge when the setting is on and nothing was written
  // yesterday.
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const wroteYesterday = activeEntries.some((e) => sameDay(new Date(e.createdAt), yesterday));
  const showNudge = profile.missedYesterdayNudge && !wroteYesterday;

  const openVoice = () => navigation.navigate('CreateJournal', { mode: 'voice' });
  const openText = () => navigation.navigate('CreateJournal', { mode: 'text' });

  useEffect(() => {
    return () => {
      recorder.stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Press-and-hold to record; release hands the clip to the voice composer.
  const startHold = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access to record a voice entry.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
    } catch {
      recordingRef.current = false;
      setRecording(false);
    }
  };

  const endHold = async () => {
    // Released before recording actually began (quick tap / permission prompt):
    // fall back to the full voice composer so the tap still does something.
    if (!recordingRef.current) {
      openVoice();
      return;
    }
    const duration = liveDuration;
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri ?? null;
    } catch {
      // fall through
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    recordingRef.current = false;
    setRecording(false);

    if (uri && duration >= MIN_HOLD_SECONDS) {
      navigation.navigate('CreateJournal', {
        mode: 'voice',
        audioUri: uri,
        audioDuration: Math.round(duration),
      });
    } else {
      openVoice(); // too short to keep — let them record on the composer
    }
  };

  return (
    <AppShell scroll>
      <View style={styles.topRow}>
        {/* The greeting doubles as a quiet way into today's timeline. */}
        <Pressable
          onPress={() => navigation.navigate('DayTimeline')}
          accessibilityRole="button"
          accessibilityLabel="Open today's timeline"
          style={({ pressed }) => [styles.greetingBlock, pressed && styles.pressedText]}
        >
          <Text style={type.greeting}>{greetingForNow()}</Text>
          <Text style={[type.bodyMuted, styles.date]}>{formatFullDate(now.toISOString())}</Text>
        </Pressable>
        <View style={styles.topActions}>
          <IconButton
            name="time-outline"
            onPress={() => navigation.navigate('DayTimeline')}
            accessibilityLabel="Open timeline"
          />
          <IconButton
            name="person-outline"
            onPress={() => navigation.navigate('Profile')}
            accessibilityLabel="Open profile"
          />
        </View>
      </View>

      <Text style={styles.prompt}>What do you want to capture today?</Text>

      <View style={styles.captureArea}>
        <View style={styles.micWrap}>
          <View style={[styles.glow, recording && styles.glowActive]} />
          <Pressable
            onPressIn={startHold}
            onPressOut={endHold}
            delayLongPress={10000}
            accessibilityRole="button"
            accessibilityLabel="Hold to record a voice entry"
            style={({ pressed }) => [
              styles.micButton,
              recording && styles.micButtonRecording,
              pressed && !recording && styles.pressed,
            ]}
          >
            {recording ? (
              <>
                <Text style={styles.recTimer}>{formatDuration(liveDuration)}</Text>
                <Text style={styles.micLabel}>RELEASE TO SAVE</Text>
              </>
            ) : (
              <>
                <Ionicons name="mic" size={34} color={colors.onPrimary} />
                <Text style={styles.micLabel}>HOLD TO SPEAK</Text>
              </>
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={openText}
          accessibilityRole="button"
          style={({ pressed }) => [styles.writeInstead, pressed && styles.pressedText]}
        >
          <Text style={styles.writeInsteadText}>Write instead</Text>
        </Pressable>
      </View>

      {todayEntries.length > 0 ? (
        <View style={styles.activityList}>
          {todayEntries.map((entry) => (
            <Pressable
              key={entry.id}
              onPress={() => navigation.navigate('JournalDetail', { entryId: entry.id })}
              accessibilityRole="button"
              accessibilityLabel={`Open entry: ${entryTitle(entry)}`}
              style={({ pressed }) => [styles.activityCard, pressed && styles.pressed]}
            >
              <View style={styles.playCircle}>
                <Ionicons
                  name={entry.type === 'voice' ? 'play' : 'document-text-outline'}
                  size={16}
                  color={colors.primaryDark}
                />
              </View>
              <View style={styles.lastText}>
                <Text style={type.label} numberOfLines={1} ellipsizeMode="tail">
                  {entryTitle(entry)}
                </Text>
                <Text style={[type.caption, styles.lastMeta]}>{entryMeta(entry)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.placeholder}>
          <View style={styles.placeholderIcon}>
            <Ionicons name="book-outline" size={30} color={colors.primary} />
          </View>
          <Text style={[type.bodyMuted, styles.placeholderText]}>No entries today yet</Text>
        </View>
      )}

      {showNudge ? (
        <View style={styles.nudge}>
          <View style={styles.nudgeText}>
            <Text style={type.label}>You missed yesterday.</Text>
            <Text style={[type.caption, styles.nudgeSub]}>Write a 30-second catch-up?</Text>
          </View>
          <Pressable onPress={openVoice} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.catchUp}>Catch up →</Text>
          </Pressable>
        </View>
      ) : null}
    </AppShell>
  );
}

const MIC = 140;
const GLOW = 216;

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  greetingBlock: { flex: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  date: { marginTop: spacing.xs },
  pressedText: { opacity: 0.6 },

  prompt: {
    fontFamily: fonts.serifRegular,
    fontSize: 21,
    lineHeight: 29,
    color: colors.text,
    marginTop: spacing.xl,
    maxWidth: 280,
  },

  captureArea: { alignItems: 'center', marginTop: spacing.xxxl },
  micWrap: {
    width: GLOW,
    height: GLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: GLOW,
    height: GLOW,
    borderRadius: GLOW / 2,
    backgroundColor: colors.secondary,
    opacity: 0.1,
  },
  glowActive: { backgroundColor: colors.recording, opacity: 0.2 },
  micButton: {
    width: MIC,
    height: MIC,
    borderRadius: MIC / 2,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  micButtonRecording: { backgroundColor: colors.recording },
  pressed: { opacity: 0.9 },
  recTimer: { fontFamily: fonts.sansSemiBold, fontSize: 22, color: colors.onPrimary },
  micLabel: {
    ...type.overline,
    color: colors.onPrimary,
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
  writeInstead: { marginTop: spacing.xl, paddingVertical: spacing.xs },
  writeInsteadText: {
    ...type.label,
    color: colors.primaryDark,
    textDecorationLine: 'underline',
  },

  activityList: { marginTop: spacing.xxxl, gap: spacing.md },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  placeholder: { alignItems: 'center', marginTop: spacing.xxxl, paddingVertical: spacing.xl },
  placeholderIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  placeholderText: { textAlign: 'center' },
  playCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastText: { flex: 1 },
  lastMeta: { marginTop: 2 },

  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  nudgeText: { flex: 1, paddingRight: spacing.md },
  nudgeSub: { marginTop: 2 },
  catchUp: { ...type.label, color: colors.secondary },
});
