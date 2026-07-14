import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppShell,
  ConfirmModal,
  IconButton,
  PrimaryButton,
  ScreenHeader,
  SegmentedControl,
  WaveformPlayer,
} from '../components';
import { api } from '../lib/api';
import { formatDuration, formatWeekdayMonthDay } from '../lib/format';
import { pickImages } from '../lib/media';
import type { RootStackParamList } from '../navigation/types';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useAuth } from '../state/AuthContext';
import { useJournals } from '../state/JournalsContext';
import { colors, radius, spacing, type } from '../theme';

type Mode = 'text' | 'voice';
type Phase = 'idle' | 'recording' | 'recorded';
type TranscriptStatus = 'idle' | 'loading' | 'done' | 'error';

const MAX_PHOTOS = 6;

export function CreateJournalScreen() {
  const navigation = useAppNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'CreateJournal'>>();
  const { getEntry, createEntry, updateEntry } = useJournals();
  const { user } = useAuth();

  const entryId = route.params?.entryId;
  const existing = entryId ? getEntry(entryId) : undefined;
  // A clip handed in from the home screen's hold-to-record button.
  const handoffUri = existing ? undefined : route.params?.audioUri;
  // Seed time for a brand-new entry — e.g. an hour tapped on the day timeline.
  const seedAt = existing ? undefined : route.params?.at;

  const [mode, setMode] = useState<Mode>(existing?.type ?? route.params?.mode ?? 'text');
  const [text, setText] = useState(existing?.text ?? '');
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);

  // Voice state
  const [phase, setPhase] = useState<Phase>(
    existing?.type === 'voice' || handoffUri ? 'recorded' : 'idle',
  );
  const [audioUri, setAudioUri] = useState<string | null>(existing?.audioUri ?? handoffUri ?? null);
  const [finalDuration, setFinalDuration] = useState(
    existing?.audioDuration ?? route.params?.audioDuration ?? 0,
  );
  const [transcript, setTranscript] = useState(existing?.transcript ?? '');
  const [transcribeEnabled, setTranscribeEnabled] = useState(true);
  const [status, setStatus] = useState<TranscriptStatus>(existing?.transcript ? 'done' : 'idle');
  const [errorText, setErrorText] = useState('');
  // Mark an already-transcribed recording as attempted so opening the entry for
  // editing never re-transcribes it.
  const attemptedUri = useRef<string | null>(existing?.transcript ? existing.audioUri ?? null : null);
  const scrollRef = useRef<ScrollView>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const player = useAudioPlayer(audioUri ? { uri: audioUri } : null);
  const playerStatus = useAudioPlayerStatus(player);

  const liveDuration = (recorderState.durationMillis ?? 0) / 1000;
  const displayDuration = phase === 'recorded' ? finalDuration : liveDuration;
  const playProgress =
    playerStatus.duration && playerStatus.duration > 0
      ? Math.min(1, (playerStatus.currentTime ?? 0) / playerStatus.duration)
      : 0;

  useEffect(() => {
    return () => {
      recorder.stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live pulse around the mic while recording: two concentric rings ripple
  // outward (scale up + fade) on a staggered loop, and the button itself
  // breathes gently. Idle/recorded, everything rests at its resting scale.
  const pulseOuter = useRef(new Animated.Value(0)).current;
  const pulseInner = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase !== 'recording') {
      [pulseOuter, pulseInner, breathe].forEach((a) => {
        a.stopAnimation();
        a.setValue(0);
      });
      return;
    }
    const ripple = (a: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(a, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const loops = [ripple(pulseOuter, 0), ripple(pulseInner, 800), breatheLoop];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [phase, pulseOuter, pulseInner, breathe]);

  const runTranscription = async (uri: string) => {
    setStatus('loading');
    setErrorText('');
    try {
      const result = await api.transcribe(uri);
      setTranscript(result);
      setStatus('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      console.warn('[transcribe] failed:', message);
      setErrorText(
        /\b50[23]\b/.test(message)
          ? "Transcription isn't available on the server right now."
          : "Couldn't reach the server to transcribe.",
      );
      setStatus('error');
    }
  };

  // Auto-transcribe when a new recording exists and the toggle is on.
  useEffect(() => {
    if (
      phase === 'recorded' &&
      audioUri &&
      user &&
      transcribeEnabled &&
      attemptedUri.current !== audioUri
    ) {
      attemptedUri.current = audioUri;
      void runTranscription(audioUri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, audioUri, user, transcribeEnabled]);

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access to record a voice entry.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch {
      Alert.alert('Could not start recording', 'Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      setFinalDuration((recorderState.durationMillis ?? 0) / 1000);
      await recorder.stop();
      setAudioUri(recorder.uri ?? null);
    } catch {
      // fall through
    } finally {
      setPhase('recorded');
      await setAudioModeAsync({ allowsRecording: false });
    }
  };

  const resetRecording = () => {
    attemptedUri.current = null;
    setAudioUri(null);
    setFinalDuration(0);
    setTranscript('');
    setStatus('idle');
    setErrorText('');
    setPhase('idle');
  };

  // Product decision: leaving mid-recording discards the take (no pause/resume).
  // Navigating away is already covered by the unmount cleanup; this covers
  // backgrounding — if the app is sent to the background while recording, stop
  // and drop it so the user returns to a clean composer.
  useEffect(() => {
    if (phase !== 'recording') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      recorder.stop().catch(() => undefined);
      void setAudioModeAsync({ allowsRecording: false });
      resetRecording();
    });
    return () => sub.remove();
    // resetRecording only calls stable state setters; recorder is a stable ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // A themed discard confirmation shared by the leave paths — navigating away
  // and switching Voice → Text — so an in-progress recording is never lost
  // silently. requestDiscard stashes what to do next; confirmDiscard stops the
  // recorder, resets, and runs it.
  const [discardVisible, setDiscardVisible] = useState(false);
  const pendingProceed = useRef<(() => void) | null>(null);
  const leavingRef = useRef(false);

  const requestDiscard = (proceed: () => void) => {
    pendingProceed.current = proceed;
    setDiscardVisible(true);
  };
  const cancelDiscard = () => {
    pendingProceed.current = null;
    setDiscardVisible(false);
  };
  const confirmDiscard = () => {
    setDiscardVisible(false);
    recorder.stop().catch(() => undefined);
    void setAudioModeAsync({ allowsRecording: false });
    resetRecording();
    const proceed = pendingProceed.current;
    pendingProceed.current = null;
    proceed?.();
  };

  // Block navigating away mid-recording until the user confirms. Guarded on
  // 'recording' so it never interferes with saving (from the 'recorded' phase);
  // leavingRef lets the re-dispatched navigation through without re-prompting.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (phase !== 'recording' || leavingRef.current) return;
      e.preventDefault();
      requestDiscard(() => {
        leavingRef.current = true;
        navigation.dispatch(e.data.action);
      });
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, phase]);

  // Switching Voice → Text while actively recording would abandon the take (and
  // leave the mic running), so confirm first — same discard rule as leaving.
  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    if (mode === 'voice' && phase === 'recording') {
      requestDiscard(() => setMode(next));
      return;
    }
    setMode(next);
  };

  const togglePlay = () => {
    if (!audioUri) return;
    if (playerStatus.playing) {
      player.pause();
      return;
    }
    // Recording leaves the audio session in record mode; switch it to playback
    // (and allow sound on the iOS silent switch) before playing, or it's silent.
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (playerStatus.didJustFinish) void player.seekTo(0);
    player.play();
  };

  const addPhotos = async () => {
    const picked = await pickImages(MAX_PHOTOS - photos.length);
    if (picked.length) setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
  };
  const removePhoto = (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  const save = () => {
    let savedId: string;
    if (mode === 'text') {
      if (existing) {
        updateEntry(existing.id, { type: 'text', text, photos });
        savedId = existing.id;
      } else {
        savedId = createEntry({ type: 'text', text, photos, createdAt: seedAt }).id;
      }
    } else {
      const voice = {
        type: 'voice' as const,
        audioUri,
        audioDuration: Math.round(finalDuration),
        transcript: transcript.trim(),
        photos,
      };
      if (existing) {
        updateEntry(existing.id, voice);
        savedId = existing.id;
      } else {
        savedId = createEntry({ ...voice, createdAt: seedAt }).id;
      }
      // Persist the recording durably (Firebase Storage) when signed in.
      if (user && audioUri && audioUri.startsWith('file:')) {
        void api.uploadRecording(savedId, audioUri).catch(() => undefined);
      }
    }
    navigation.goBack();
  };

  // ---- footer ----
  const canSaveText = text.trim().length > 0 || photos.length > 0;
  let footer: React.ReactNode;
  if (mode === 'text') {
    footer = <PrimaryButton label="Save journal" onPress={save} disabled={!canSaveText} />;
  } else if (phase === 'recorded') {
    footer = <PrimaryButton label="Save journal" onPress={save} />;
  }

  // When there is no footer button (voice, before recording), keep the bottom
  // content clear of the home indicator / Android nav bar.
  const bodyPad = footer ? null : { paddingBottom: Math.max(insets.bottom, spacing.md) };

  // The recorded-voice view holds the transcript input low on the screen, so it
  // scrolls to keep the field above the keyboard. The full-height text editor
  // and the (input-less) recording UI stay fixed.
  const scroll = mode === 'voice' && phase === 'recorded';

  const header = (
    <ScreenHeader
      title={existing ? 'Edit journal' : 'New Journal'}
      subtitle={formatWeekdayMonthDay(existing?.createdAt ?? seedAt ?? new Date().toISOString())}
      left={<IconButton name="chevron-back" onPress={() => navigation.goBack()} accessibilityLabel="Go back" />}
    />
  );

  return (
    <>
    <AppShell header={header} footer={footer} scroll={scroll} scrollRef={scrollRef}>
      <View style={styles.segment}>
        <SegmentedControl
          options={[
            { label: 'Text', value: 'text' },
            { label: 'Voice', value: 'voice' },
          ]}
          value={mode}
          onChange={(v) => handleModeChange(v as Mode)}
        />
      </View>

      {mode === 'text' ? (
        <View style={[styles.body, bodyPad]}>
          <View style={styles.textCard}>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              autoFocus={!existing}
              placeholder="What happened, what mattered, what are you carrying?"
              placeholderTextColor={colors.mutedText}
              style={[type.reading, styles.textInput]}
            />
          </View>
          <PhotoRow
            photos={photos}
            onAdd={addPhotos}
            onRemove={removePhoto}
            canAdd={photos.length < MAX_PHOTOS}
          />
        </View>
      ) : (
        <View style={[phase === 'recorded' ? undefined : styles.body, bodyPad]}>
          {phase !== 'recorded' ? (
            <>
              <View style={styles.voiceCenter}>
                <Text style={styles.timer}>{formatDuration(displayDuration)}</Text>
                <Text style={[type.bodyMuted, styles.voiceHint]}>
                  {phase === 'recording' ? 'Tap to stop' : 'Tap to begin'}
                </Text>
                <View style={styles.micWrap}>
                  {phase === 'recording' ? (
                    <>
                      <Animated.View
                        style={[
                          styles.ring,
                          styles.ringOuter,
                          {
                            opacity: pulseOuter.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.28, 0],
                            }),
                            transform: [
                              {
                                scale: pulseOuter.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.85, 1.4],
                                }),
                              },
                            ],
                          },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.ring,
                          styles.ringInner,
                          {
                            opacity: pulseInner.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.34, 0],
                            }),
                            transform: [
                              {
                                scale: pulseInner.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.85, 1.4],
                                }),
                              },
                            ],
                          },
                        ]}
                      />
                    </>
                  ) : (
                    <>
                      <View style={[styles.ring, styles.ringOuter]} />
                      <View style={[styles.ring, styles.ringInner]} />
                    </>
                  )}
                  <Animated.View
                    style={{
                      transform: [
                        {
                          scale: breathe.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.06],
                          }),
                        },
                      ],
                    }}
                  >
                    <Pressable
                      onPress={phase === 'recording' ? stopRecording : startRecording}
                      accessibilityRole="button"
                      accessibilityLabel={phase === 'recording' ? 'Stop recording' : 'Start recording'}
                      style={({ pressed }) => [styles.micButton, pressed && styles.pressed]}
                    >
                      {phase === 'recording' ? (
                        <View style={styles.stopIcon} />
                      ) : (
                        <Ionicons name="mic" size={34} color={colors.onPrimary} />
                      )}
                    </Pressable>
                  </Animated.View>
                </View>
              </View>
              <View style={styles.voiceBottom}>
                <TranscribeToggle value={transcribeEnabled} onChange={setTranscribeEnabled} />
                <PhotoRow
                  photos={photos}
                  onAdd={addPhotos}
                  onRemove={removePhoto}
                  canAdd={photos.length < MAX_PHOTOS}
                  compact
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.recordedHead}>
                <Text style={styles.timer}>{formatDuration(finalDuration)}</Text>
                <Text style={[type.label, styles.completeText]}>Recording complete</Text>
                <WaveformPlayer
                  playing={playerStatus.playing}
                  progress={playProgress}
                  onToggle={togglePlay}
                />
              </View>

              <View style={styles.voiceBottom}>
                <TranscribeToggle value={transcribeEnabled} onChange={setTranscribeEnabled} />

                {status === 'loading' ? (
                  <View style={styles.statusRow}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={type.caption}>Transcribing…</Text>
                  </View>
                ) : status === 'error' ? (
                  <Pressable
                    onPress={() => audioUri && runTranscription(audioUri)}
                    style={styles.statusRow}
                    accessibilityRole="button"
                  >
                    <Ionicons name="refresh" size={14} color={colors.secondary} />
                    <Text style={[type.caption, styles.retryText]}>{errorText} Tap to retry.</Text>
                  </Pressable>
                ) : null}

                {/* Transcript stays visible the whole time (editable). */}
                <TextInput
                  value={transcript}
                  onChangeText={setTranscript}
                  multiline
                  onFocus={() =>
                    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)
                  }
                  placeholder="Add or edit the transcript"
                  placeholderTextColor={colors.mutedText}
                  style={[type.body, styles.transcriptInput]}
                />

                <PhotoRow
                  photos={photos}
                  onAdd={addPhotos}
                  onRemove={removePhoto}
                  canAdd={photos.length < MAX_PHOTOS}
                  compact
                />
              </View>
            </>
          )}
        </View>
      )}
    </AppShell>

      <ConfirmModal
        visible={discardVisible}
        destructive
        icon="mic-off-outline"
        title="Discard recording?"
        message="You’re still recording. If you continue, this recording will be discarded."
        confirmLabel="Discard recording"
        cancelLabel="Keep recording"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </>
  );
}

/** "Transcribe recording" toggle card. */
function TranscribeToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleCard}>
      <View style={styles.toggleText}>
        <Text style={type.label}>Transcribe recording</Text>
        <Text style={type.caption}>Convert speech to editable text</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

/** "Add photo" link (empty) or a strip of thumbnails with a + tile. */
function PhotoRow({
  photos,
  onAdd,
  onRemove,
  canAdd,
  compact,
}: {
  photos: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  canAdd: boolean;
  compact?: boolean;
}) {
  if (photos.length === 0) {
    return (
      <Pressable onPress={onAdd} accessibilityRole="button" style={styles.addPhotoLink}>
        <Ionicons name="image-outline" size={18} color={colors.mutedText} />
        <Text style={type.bodyMuted}>Add photo</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.photoStrip, compact && styles.photoStripCompact]}>
      {photos.map((uri, i) => (
        <View key={`${uri}-${i}`} style={styles.thumb}>
          <Image source={{ uri }} style={styles.thumbImg} />
          <Pressable
            onPress={() => onRemove(i)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            style={styles.thumbRemove}
          >
            <Ionicons name="close" size={12} color={colors.onPrimary} />
          </Pressable>
        </View>
      ))}
      {canAdd ? (
        <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add photo" style={[styles.thumb, styles.addThumb]}>
          <Ionicons name="add" size={24} color={colors.mutedText} />
        </Pressable>
      ) : null}
    </View>
  );
}

const THUMB = 64;

const styles = StyleSheet.create({
  segment: { paddingTop: spacing.sm, paddingBottom: spacing.lg },
  body: { flex: 1 },

  // Text mode
  textCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  textInput: { flex: 1, textAlignVertical: 'top' },

  // Voice mode
  voiceCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Recorded view is scrollable, so its head is top-aligned instead of centered.
  recordedHead: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md },
  timer: { ...type.title, fontSize: 44, lineHeight: 50, color: colors.text },
  voiceHint: { marginTop: spacing.xs },
  micWrap: {
    marginTop: spacing.xxl,
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: colors.recording,
  },
  ringOuter: { width: 180, height: 180, opacity: 0.08 },
  ringInner: { width: 132, height: 132, opacity: 0.12 },
  micButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.recording,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  stopIcon: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.onPrimary },
  completeText: { marginTop: spacing.xs, color: colors.primaryDark },
  voiceBottom: { gap: spacing.md, paddingBottom: spacing.sm },

  // Transcribe toggle
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  toggleText: { flex: 1, paddingRight: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  retryText: { color: colors.secondary, flex: 1 },
  transcriptInput: {
    maxHeight: 120,
    minHeight: 64,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },

  // Photos
  addPhotoLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  photoStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoStripCompact: {},
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.softSurface },
  thumbImg: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
