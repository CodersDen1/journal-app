import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell, IconButton } from '../components';
import { entryPreview, formatDuration, formatFullDate, formatTime, greetingForNow } from '../lib/format';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useJournals } from '../state/JournalsContext';
import { useProfile } from '../state/ProfileContext';
import { colors, fonts, radius, shadow, spacing, type } from '../theme';
import type { JournalEntry } from '../types';


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
  // True while the button is physically held. Set synchronously so the async
  // startHold can detect an early release (a quick tap) and abort before the mic
  // starts — otherwise the tap orphans a background recording that keeps the
  // timer running when you come back to this screen.
  const heldRef = useRef(false);
  // Wall-clock start of the actual recording, for a reliable hold duration
  // (recorderState can lag the release).
  const recordStartRef = useRef(0);
  // Hands-free "lock": holding past 3s locks recording so you can release your
  // finger; a Stop button then ends it. lockedRef mirrors state for handlers.
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const LOCK_AFTER_MS = 3000;

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

  // ---- animations (transform/opacity only, native driver — Fabric-safe) ----
  // Staggered spring entrance for the two capture cards.
  const enterVoice = useRef(new Animated.Value(0)).current;
  const enterWrite = useRef(new Animated.Value(0)).current;
  // Press feedback scale for each card.
  const pressVoice = useRef(new Animated.Value(1)).current;
  const pressWrite = useRef(new Animated.Value(1)).current;
  // Gentle looping pulse on the mic while recording.
  const pulse = useRef(new Animated.Value(0)).current;
  // Lock badge entrance when recording locks hands-free.
  const lockAnim = useRef(new Animated.Value(0)).current;
  // 0→1 over the hold-to-lock window; drives the "charging" ring around the card.
  const lockProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(110, [
      Animated.spring(enterVoice, { toValue: 1, useNativeDriver: true, stiffness: 150, damping: 15, mass: 1 }),
      Animated.spring(enterWrite, { toValue: 1, useNativeDriver: true, stiffness: 150, damping: 15, mass: 1 }),
    ]).start();
  }, [enterVoice, enterWrite]);

  useEffect(() => {
    if (!recording) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulse]);

  const springTo = (v: Animated.Value, toValue: number) =>
    Animated.spring(v, { toValue, useNativeDriver: true, stiffness: 320, damping: 22, mass: 1 }).start();

  // Entrance + press transform for a card.
  const cardAnim = (enter: Animated.Value, press: Animated.Value) => ({
    opacity: enter,
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
      { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
      { scale: press },
    ],
  });

  const micScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  // Lock badge drops in with a little rotate + scale when recording locks.
  const lockBadgeStyle = {
    opacity: lockAnim,
    transform: [
      { scale: lockAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
      { rotate: lockAnim.interpolate({ inputRange: [0, 1], outputRange: ['-35deg', '0deg'] }) },
    ],
  };

  // "Charging" ring: converges onto the card + brightens as the hold approaches
  // the lock, then snaps on. Communicates "keep holding to lock in".
  const lockRingStyle = {
    opacity: lockProgress.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.6, 1] }),
    transform: [{ scale: lockProgress.interpolate({ inputRange: [0, 1], outputRange: [1.16, 1] }) }],
  };

  useEffect(() => {
    return () => {
      lockProgress.stopAnimation();
      recorder.stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Press-and-hold to record; release hands the clip to the voice composer.
  const startHold = async () => {
    heldRef.current = true;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        heldRef.current = false;
        Alert.alert('Microphone needed', 'Allow microphone access to record a voice entry.');
        return;
      }
      if (!heldRef.current) return; // released during the permission prompt
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      if (!heldRef.current) {
        // Released before recording began — undo the session, never start the mic.
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        return;
      }
      recorder.record();
      recordStartRef.current = Date.now();
      recordingRef.current = true;
      setRecording(true);
      // Arm the hands-free lock: the ring "charges" over LOCK_AFTER_MS and, when
      // it completes, locks recording — visual and lock stay perfectly in sync.
      lockProgress.setValue(0);
      Animated.timing(lockProgress, {
        toValue: 1,
        duration: LOCK_AFTER_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !recordingRef.current || lockedRef.current) return;
        lockedRef.current = true;
        setLocked(true);
        Animated.spring(lockAnim, {
          toValue: 1,
          useNativeDriver: true,
          stiffness: 220,
          damping: 12,
          mass: 1,
        }).start();
      });
    } catch {
      recordingRef.current = false;
      setRecording(false);
    }
  };

  // Cancel the lock countdown (finger lifted before locking, or recording ended).
  const stopLockCountdown = () => {
    lockProgress.stopAnimation();
    lockProgress.setValue(0);
  };

  // Stop the (locked) recording and hand the clip to the voice composer.
  const stopLockedRecording = async () => {
    stopLockCountdown();
    const elapsed = recordStartRef.current ? (Date.now() - recordStartRef.current) / 1000 : liveDuration;
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri ?? null;
    } catch {
      // fall through
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    recordingRef.current = false;
    recordStartRef.current = 0;
    lockedRef.current = false;
    setRecording(false);
    setLocked(false);
    lockAnim.setValue(0);
    if (uri) {
      navigation.navigate('CreateJournal', {
        mode: 'voice',
        audioUri: uri,
        audioDuration: Math.max(1, Math.round(elapsed)),
      });
    } else {
      openVoice();
    }
  };

  const endHold = async () => {
    heldRef.current = false;
    // Once locked, lifting the finger does nothing — recording is hands-free
    // and only the Stop button ends it.
    if (lockedRef.current) return;
    stopLockCountdown();
    // Released before recording actually began (quick tap / still preparing):
    // fall back to the full voice composer so the tap still does something. The
    // in-flight startHold sees heldRef=false and aborts without starting the mic.
    if (!recordingRef.current) {
      openVoice();
      return;
    }
    // Measure the hold from a wall-clock stamp — recorderState can lag release.
    const elapsed = recordStartRef.current ? (Date.now() - recordStartRef.current) / 1000 : liveDuration;
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri ?? null;
    } catch {
      // fall through
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    recordingRef.current = false;
    recordStartRef.current = 0;
    setRecording(false);

    // A recording happened → hand the clip to the composer, already loaded. Only
    // a tap that never armed the mic (handled above) opens an empty composer.
    if (uri) {
      navigation.navigate('CreateJournal', {
        mode: 'voice',
        audioUri: uri,
        audioDuration: Math.max(1, Math.round(elapsed)),
      });
    } else {
      openVoice();
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

      <View style={styles.cardsRow}>
        {/* Voice — hold to record; hold past 3s locks it hands-free. */}
        <Animated.View
          style={[
            styles.card,
            recording ? styles.voiceCardRecording : styles.voiceCard,
            cardAnim(enterVoice, pressVoice),
          ]}
        >
          {recording && !locked ? (
            <Animated.View style={[styles.lockRing, lockRingStyle]} pointerEvents="none" />
          ) : null}

          {locked ? (
            <Animated.View style={[styles.lockBadge, lockBadgeStyle]} pointerEvents="none">
              <Ionicons name="lock-closed" size={13} color={colors.onPrimary} />
            </Animated.View>
          ) : null}

          {locked ? (
            // Locked: hands-free recording with a live waveform + Stop button.
            <View style={styles.lockedInner}>
              <Text style={styles.recTimer}>{formatDuration(liveDuration)}</Text>
              <RecordingWave color={colors.onPrimary} />
              <Pressable
                onPress={stopLockedRecording}
                accessibilityRole="button"
                accessibilityLabel="Stop recording and save"
                style={({ pressed }) => [styles.stopBtn, pressed && styles.pressed]}
              >
                <View style={styles.stopSquare} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPressIn={() => {
                springTo(pressVoice, 0.95);
                void startHold();
              }}
              onPressOut={() => {
                springTo(pressVoice, 1);
                void endHold();
              }}
              delayLongPress={10000}
              accessibilityRole="button"
              accessibilityLabel="Hold to record a voice entry"
              style={styles.cardInner}
            >
              <Animated.View style={[styles.cardIcon, { transform: [{ scale: micScale }] }]}>
                <Ionicons name="mic" size={26} color={colors.onPrimary} />
              </Animated.View>
              <View style={styles.cardTextBlock}>
                {recording ? (
                  <>
                    <Text style={styles.cardTitle}>{formatDuration(liveDuration)}</Text>
                    <Text style={styles.cardSubtitle}>HOLD TO LOCK</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.cardTitle}>Voice</Text>
                    <Text style={styles.cardSubtitle}>Hold to speak</Text>
                  </>
                )}
              </View>
            </Pressable>
          )}
        </Animated.View>

        {/* Write — tap to open the text composer. */}
        <Animated.View style={[styles.card, styles.writeCard, cardAnim(enterWrite, pressWrite)]}>
          <Pressable
            onPressIn={() => springTo(pressWrite, 0.95)}
            onPressOut={() => springTo(pressWrite, 1)}
            onPress={openText}
            disabled={recording}
            accessibilityRole="button"
            accessibilityLabel="Write a journal entry"
            style={styles.cardInner}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="create-outline" size={26} color={colors.onPrimary} />
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={styles.cardTitle}>Write</Text>
              <Text style={styles.cardSubtitle}>Jot it down</Text>
            </View>
          </Pressable>
        </Animated.View>
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

/** A live, looping equalizer shown while a locked recording is in progress. */
function RecordingWave({ color }: { color: string }) {
  const bars = useRef(Array.from({ length: 11 }, () => new Animated.Value(0.35))).current;
  useEffect(() => {
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((i % 5) * 80),
          Animated.timing(b, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(b, { toValue: 0.35, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [bars]);
  return (
    <View style={styles.waveRow}>
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={[styles.waveBar, { backgroundColor: color, transform: [{ scaleY: b }] }]}
        />
      ))}
    </View>
  );
}

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

  // Two-column capture cards
  cardsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  card: {
    flex: 1,
    minHeight: 184,
    borderRadius: radius.xl,
    ...shadow.floating,
  },
  voiceCard: { backgroundColor: colors.secondary },
  voiceCardRecording: { backgroundColor: colors.recording },
  writeCard: { backgroundColor: colors.primary },
  pressed: { opacity: 0.9 },
  cardInner: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(251, 248, 241, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextBlock: { marginTop: spacing.lg },
  cardTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.onPrimary,
  },
  cardSubtitle: {
    ...type.caption,
    color: colors.onPrimary,
    opacity: 0.85,
    marginTop: 2,
    letterSpacing: 0.3,
  },

  // Locked hands-free recording panel (inside the voice card)
  lockedInner: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  lockRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.xl,
    borderWidth: 2.5,
    borderColor: 'rgba(251, 248, 241, 0.9)',
  },
  lockBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(251, 248, 241, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  recTimer: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 24,
    color: colors.onPrimary,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    gap: 3,
  },
  waveBar: {
    width: 3,
    height: 28,
    borderRadius: 2,
  },
  stopBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(251, 248, 241, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: colors.onPrimary,
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
