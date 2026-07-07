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

import { AppShell, IconButton, PrimaryButton, ScreenHeader, SegmentedControl } from '../components';
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

const WAVE_BARS = [10, 18, 28, 20, 34, 24, 40, 30, 22, 36, 16, 28, 42, 26, 18, 30, 22, 34, 14, 24];
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
  // Show an existing transcript by default (don't hide it behind "Read text").
  const [showTranscript, setShowTranscript] = useState(Boolean(existing?.transcript));
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

  useEffect(() => {
    return () => {
      recorder.stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTranscription = async (uri: string) => {
    setStatus('loading');
    setErrorText('');
    try {
      const result = await api.transcribe(uri);
      setTranscript(result);
      setStatus('done');
      setShowTranscript(true); // reveal the transcript as soon as it's ready
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
    setShowTranscript(false);
    setPhase('idle');
  };

  const togglePlay = () => {
    if (!audioUri) return;
    if (playerStatus.playing) {
      player.pause();
      return;
    }
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
        savedId = createEntry({ type: 'text', text, photos }).id;
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
        savedId = createEntry(voice).id;
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
    footer = (
      <View style={styles.voiceFooter}>
        <PrimaryButton
          label={playerStatus.playing ? 'Pause' : 'Play'}
          variant="secondary"
          onPress={togglePlay}
          fullWidth={false}
          style={styles.footerBtn}
          icon={
            <Ionicons
              name={playerStatus.playing ? 'pause' : 'play'}
              size={16}
              color={colors.primaryDark}
            />
          }
        />
        <PrimaryButton
          label="Read text"
          variant="secondary"
          onPress={() => setShowTranscript((v) => !v)}
          fullWidth={false}
          style={styles.footerBtn}
        />
        <PrimaryButton label="Save" onPress={save} fullWidth={false} style={styles.footerSave} />
      </View>
    );
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
      subtitle={formatWeekdayMonthDay(existing?.createdAt ?? new Date().toISOString())}
      left={<IconButton name="chevron-back" onPress={() => navigation.goBack()} accessibilityLabel="Go back" />}
    />
  );

  return (
    <AppShell header={header} footer={footer} scroll={scroll} scrollRef={scrollRef}>
      <View style={styles.segment}>
        <SegmentedControl
          options={[
            { label: 'Text', value: 'text' },
            { label: 'Voice', value: 'voice' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
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
                  <View style={[styles.ring, styles.ringOuter]} />
                  <View style={[styles.ring, styles.ringInner]} />
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
                <View style={styles.wave}>
                  {WAVE_BARS.map((h, i) => (
                    <View key={i} style={[styles.waveBar, { height: h }]} />
                  ))}
                </View>
                <Pressable onPress={resetRecording} style={styles.reRecord} accessibilityRole="button">
                  <Ionicons name="refresh" size={16} color={colors.primaryDark} />
                  <Text style={[type.caption, styles.reRecordText]}>Record again</Text>
                </Pressable>
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

                {showTranscript ? (
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
                ) : null}

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
  wave: { flexDirection: 'row', alignItems: 'center', height: 56, gap: 4, marginTop: spacing.xl },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: colors.recording },
  reRecord: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl },
  reRecordText: { color: colors.primaryDark },
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

  // Footer
  voiceFooter: { flexDirection: 'row', gap: spacing.sm },
  footerBtn: { flex: 1, paddingHorizontal: spacing.md },
  footerSave: { flex: 1.3 },
});
