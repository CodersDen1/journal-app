import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell, EmptyState, IconButton, PhotoGrid, ScreenHeader } from '../components';
import { api } from '../lib/api';
import { fetchIdToken } from '../lib/firebase';
import { formatDuration, formatRelativeDay, formatTime, formatWeekdayMonthDay } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useAuth } from '../state/AuthContext';
import { useJournals } from '../state/JournalsContext';
import { useSnackbar } from '../state/SnackbarContext';
import { colors, radius, spacing, type } from '../theme';

type ListenMode = 'recording' | 'tts';

/**
 * "Listen" player for the detail screen.
 *
 *  - Voice entries (mode="recording") play the ORIGINAL recording: the on-device
 *    file if it's still here, otherwise the copy stored in Firebase Storage.
 *  - Text entries (mode="tts") play Gemini-generated "audio of the text",
 *    generated once server-side and cached on-device by version.
 */
function ListenSection({
  entryId,
  version,
  mode,
  localUri,
}: {
  entryId: string;
  version: string;
  mode: ListenMode;
  localUri?: string | null;
}) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [errorText, setErrorText] = useState('');
  const autoplay = useRef(false);

  const ext = mode === 'recording' ? 'm4a' : 'wav';
  const cacheFile = `${FileSystem.documentDirectory ?? ''}${mode}-${entryId}-${version.replace(/\D/g, '')}.${ext}`;

  const source = useMemo(() => (fileUri ? { uri: fileUri } : null), [fileUri]);
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  const total = status.duration && status.duration > 0 ? status.duration : 0;
  const position = status.currentTime ?? 0;
  const progress = total > 0 ? Math.min(1, position / total) : 0;

  // Reuse audio already on this device: for a recording prefer the original
  // local file; otherwise a previously downloaded/generated cache file.
  useEffect(() => {
    let active = true;
    (async () => {
      if (mode === 'recording' && localUri) {
        const info = await FileSystem.getInfoAsync(localUri).catch(() => null);
        if (active && info?.exists) {
          setFileUri(localUri);
          return;
        }
      }
      const cached = await FileSystem.getInfoAsync(cacheFile).catch(() => null);
      if (active && cached?.exists) setFileUri(cacheFile);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheFile, mode, localUri]);

  useEffect(() => {
    if (fileUri && autoplay.current) {
      autoplay.current = false;
      player.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUri]);

  // Fetch from the backend (original recording, or generate TTS), then play.
  const prepare = async () => {
    setPhase('loading');
    setErrorText('');
    try {
      const token = await fetchIdToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const url = mode === 'recording' ? api.recordingUrl(entryId) : api.ttsUrl(entryId);
      const res = await FileSystem.downloadAsync(url, cacheFile, { headers });
      if (res.status === 200) {
        autoplay.current = true;
        setFileUri(res.uri);
        setPhase('idle');
        return;
      }
      // A recording that isn't stored server-side can still be the local file.
      if (mode === 'recording' && localUri) {
        autoplay.current = true;
        setFileUri(localUri);
        setPhase('idle');
        return;
      }
      setErrorText(
        mode === 'recording'
          ? "This recording isn't available."
          : res.status === 503
            ? "Text-to-speech isn't configured on the server."
            : res.status === 404
              ? "This entry isn't synced to your account yet."
              : `Couldn't generate audio (${res.status}).`,
      );
      setPhase('error');
    } catch {
      if (mode === 'recording' && localUri) {
        autoplay.current = true;
        setFileUri(localUri);
        setPhase('idle');
        return;
      }
      setErrorText("Couldn't reach the server.");
      setPhase('error');
    }
  };

  const onPress = () => {
    if (phase === 'loading') return;
    if (!fileUri) {
      void prepare();
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish) void player.seekTo(0);
      player.play();
    }
  };

  const idleHint = mode === 'recording' ? 'Play the recording' : 'Listen to this entry';
  const loadingHint = mode === 'recording' ? 'Loading recording…' : 'Generating audio…';

  return (
    <View>
      <Text style={[type.overline, styles.listenLabel]}>Listen</Text>
      {phase === 'error' ? (
        <Pressable onPress={() => void prepare()} style={styles.listenError} accessibilityRole="button">
          <Ionicons name="refresh" size={16} color={colors.secondary} />
          <Text style={[type.caption, styles.listenErrorText]}>{errorText} Tap to try again.</Text>
        </Pressable>
      ) : (
        <View style={styles.listenPlayer}>
          <Pressable
            onPress={onPress}
            disabled={phase === 'loading'}
            accessibilityRole="button"
            accessibilityLabel={status.playing ? 'Pause' : 'Play'}
            style={styles.listenButton}
          >
            {phase === 'loading' ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Ionicons name={status.playing ? 'pause' : 'play'} size={20} color={colors.onPrimary} />
            )}
          </Pressable>
          <View style={styles.listenBody}>
            {fileUri ? (
              <>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${progress * 100}%` }]} />
                </View>
                <View style={styles.times}>
                  <Text style={type.caption}>{formatDuration(position)}</Text>
                  <Text style={type.caption}>{formatDuration(total)}</Text>
                </View>
              </>
            ) : (
              <Text style={type.bodyMuted}>{phase === 'loading' ? loadingHint : idleHint}</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

export function JournalDetailScreen() {
  const navigation = useAppNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'JournalDetail'>>();
  const { getEntry, toggleFavorite, archiveEntry, deleteEntry, restoreEntry } = useJournals();
  const { user } = useAuth();
  const snackbar = useSnackbar();

  const entry = getEntry(route.params.entryId);

  if (!entry) {
    return (
      <AppShell header={<ScreenHeader onBack={navigation.goBack} />}>
        <EmptyState icon="book-outline" title="Entry not found" message="This entry may have been deleted." />
      </AppShell>
    );
  }

  const isVoice = entry.type === 'voice';
  const bodyText = (entry.text || entry.transcript || '').trim();
  const paragraphs = bodyText ? bodyText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [];

  // Voice → play the original recording. Text → generated "audio of the text".
  const canListen = isVoice ? Boolean(entry.audioUri) || Boolean(user) : Boolean(user && bodyText);

  const onArchive = () => {
    archiveEntry(entry.id);
    snackbar.show({ message: 'Entry archived', actionLabel: 'Undo', onAction: () => restoreEntry(entry.id) });
    navigation.goBack();
  };
  const onDelete = () => {
    deleteEntry(entry.id);
    snackbar.show({ message: 'Entry deleted', actionLabel: 'Undo', onAction: () => restoreEntry(entry.id) });
    navigation.goBack();
  };
  const openMenu = () => {
    Alert.alert('Entry', undefined, [
      { text: 'Archive', onPress: onArchive },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const actions: { label: string; onPress: () => void }[] = [
    { label: 'Edit', onPress: () => navigation.navigate('CreateJournal', { entryId: entry.id }) },
    { label: 'Reflect', onPress: () => navigation.navigate('Tabs', { screen: 'Insights' }) },
    { label: '⋯', onPress: openMenu },
  ];

  const header = (
    <ScreenHeader
      title={`${formatRelativeDay(entry.createdAt)} · ${formatTime(entry.createdAt)}`}
      subtitle={formatWeekdayMonthDay(entry.createdAt)}
      onBack={navigation.goBack}
      right={
        <IconButton
          name={entry.favorite ? 'heart' : 'heart-outline'}
          color={entry.favorite ? colors.secondary : colors.text}
          onPress={() => toggleFavorite(entry.id)}
          accessibilityLabel="Favorite"
        />
      }
    />
  );

  return (
    <AppShell header={header} scroll>
      {paragraphs.length > 0 ? (
        <View style={styles.bodyBlock}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={[type.reading, styles.paragraph]}>
              {p}
            </Text>
          ))}
        </View>
      ) : null}

      {entry.photos.length > 0 ? (
        <View style={styles.block}>
          <PhotoGrid photos={entry.photos} columns={2} />
        </View>
      ) : null}

      {canListen ? (
        <View style={styles.block}>
          <ListenSection
            entryId={entry.id}
            version={entry.updatedAt}
            mode={isVoice ? 'recording' : 'tts'}
            localUri={isVoice ? entry.audioUri : null}
          />
        </View>
      ) : null}

      <View style={styles.actionRow}>
        {actions.map((action, i) => (
          <View key={action.label} style={styles.actionItem}>
            {i > 0 ? <Text style={styles.actionDot}>·</Text> : null}
            <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
              <Text style={[type.label, styles.actionText]}>{action.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  bodyBlock: { marginTop: spacing.sm, marginBottom: spacing.lg },
  paragraph: { marginBottom: spacing.lg },
  block: { marginBottom: spacing.xl },

  // Listen player
  listenLabel: { marginBottom: spacing.sm },
  listenPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.softSurface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  listenButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  listenBody: { flex: 1 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  listenError: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  listenErrorText: { color: colors.secondary, flex: 1 },

  // Actions
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionItem: { flexDirection: 'row', alignItems: 'center' },
  actionDot: { color: colors.mutedText, marginHorizontal: spacing.md },
  actionText: { color: colors.primaryDark },
});
