import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell, CalendarSheet, IconButton, ScreenHeader, TimelineEntryCard } from '../components';
import { formatRelativeDay, formatWeekdayMonthDay } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useJournals } from '../state/JournalsContext';
import { colors, fonts, spacing, type } from '../theme';
import type { JournalEntry } from '../types';

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const clampHour = (h: number) => Math.min(23, Math.max(0, h));

/** "7 AM", "Noon", "12 AM", "1 PM" … */
function hourLabel(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return 'Noon';
  const period = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12} ${period}`;
}

/** The inclusive hour range to render, padded for breathing room. */
function hourRange(entryHours: number[], nowHour: number | null): number[] {
  const marks = [...entryHours];
  if (nowHour !== null) marks.push(nowHour);
  if (marks.length === 0) {
    const base = nowHour ?? 9;
    const start = clampHour(base - 3);
    const end = clampHour(base + 3);
    return range(start, end);
  }
  const start = clampHour(Math.min(...marks) - 1);
  let end = clampHour(Math.max(...marks));
  // Leave room after "Now" when it's the latest thing on the timeline.
  const latestEntryHour = entryHours.length ? Math.max(...entryHours) : -1;
  if (nowHour !== null && nowHour >= latestEntryHour) end = clampHour(nowHour + 2);
  return range(start, Math.max(end, start));
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let h = start; h <= end; h += 1) out.push(h);
  return out;
}

/** A rendered timeline row: a single hour, or a collapsed run of empty hours. */
type Segment = { kind: 'hour'; hour: number } | { kind: 'gap'; from: number; to: number };

/**
 * Collapse consecutive empty hours into gap segments. An hour is kept (rendered
 * on its own) when it has entries or is the current hour; a lone empty hour is
 * also kept, but runs of two or more empty hours become one compact gap.
 */
function buildSegments(hours: number[], isKept: (h: number) => boolean): Segment[] {
  const segs: Segment[] = [];
  let gapStart: number | null = null;
  const flush = (end: number) => {
    if (gapStart === null) return;
    if (end > gapStart) segs.push({ kind: 'gap', from: gapStart, to: end });
    else segs.push({ kind: 'hour', hour: gapStart }); // single empty hour stays inline
    gapStart = null;
  };
  for (const h of hours) {
    if (isKept(h)) {
      flush(h - 1);
      segs.push({ kind: 'hour', hour: h });
    } else if (gapStart === null) {
      gapStart = h;
    }
  }
  flush(hours[hours.length - 1]);
  return segs;
}

/**
 * A vertical, hour-by-hour timeline of a single day's entries (today by
 * default). Entries sit at the hour they were created; a green "Now" marker
 * shows the current time. Tapping an entry opens it for editing.
 */
export function DayTimelineScreen() {
  const navigation = useAppNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'DayTimeline'>>();
  const { activeEntries } = useJournals();

  const scrollRef = useRef<ScrollView>(null);
  const nowY = useRef(0);
  const didAutoScroll = useRef(false);

  const [dayISO, setDayISO] = useState(route.params?.date ?? new Date().toISOString());
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(new Set());
  const day = useMemo(() => new Date(dayISO), [dayISO]);
  const now = new Date();
  const isToday = sameDay(day, now);
  const nowHour = isToday ? now.getHours() : null;

  const [pickerOpen, setPickerOpen] = useState(false);

  // On day change reset scroll + collapsed gaps; today re-scrolls to Now via onNowLayout.
  useEffect(() => {
    didAutoScroll.current = false;
    setExpandedGaps(new Set());
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [dayISO]);

  const toggleGap = (key: string) =>
    setExpandedGaps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // This day's entries, earliest first (top of the timeline).
  const dayEntries = useMemo(
    () =>
      activeEntries
        .filter((e) => sameDay(new Date(e.createdAt), day))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [activeEntries, day],
  );

  const byHour = useMemo(() => {
    const map: Record<number, JournalEntry[]> = {};
    for (const e of dayEntries) {
      const h = new Date(e.createdAt).getHours();
      (map[h] ??= []).push(e);
    }
    return map;
  }, [dayEntries]);

  const hours = useMemo(
    () => hourRange(dayEntries.map((e) => new Date(e.createdAt).getHours()), nowHour),
    [dayEntries, nowHour],
  );

  const segments = useMemo(
    () => buildSegments(hours, (h) => (byHour[h]?.length ?? 0) > 0 || h === nowHour),
    [hours, byHour, nowHour],
  );

  const scrollToNow = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, nowY.current - 140), animated: true });
  };

  const onNowLayout = (e: LayoutChangeEvent) => {
    nowY.current = e.nativeEvent.layout.y;
    if (!didAutoScroll.current) {
      didAutoScroll.current = true;
      requestAnimationFrame(scrollToNow);
    }
  };

  const renderHour = (h: number) => (
    <React.Fragment key={`h-${h}`}>
      <View style={styles.hourRow}>
        <Text style={styles.hourLabel}>{hourLabel(h)}</Text>
        <View style={styles.hourContent}>
          <View style={styles.gridline} />
          <View style={styles.hourEntries}>
            {(byHour[h] ?? []).map((entry) => (
              <TimelineEntryCard
                key={entry.id}
                entry={entry}
                onPress={() => navigation.navigate('CreateJournal', { entryId: entry.id })}
              />
            ))}
          </View>
        </View>
      </View>

      {nowHour === h ? (
        <View style={styles.nowRow} onLayout={onNowLayout}>
          <Text style={styles.nowLabel}>Now</Text>
          <View style={styles.nowContent}>
            <View style={styles.nowDot} />
            <View style={styles.nowLine} />
          </View>
        </View>
      ) : null}
    </React.Fragment>
  );

  const renderGap = (from: number, to: number) => {
    const key = `${from}-${to}`;
    if (expandedGaps.has(key)) return range(from, to).map(renderHour);
    const span = to - from + 1;
    return (
      <Pressable
        key={`g-${key}`}
        onPress={() => toggleGap(key)}
        accessibilityRole="button"
        accessibilityLabel={`Show ${span} quiet hours, ${hourLabel(from)} to ${hourLabel(to)}`}
        style={({ pressed }) => [styles.gapRow, pressed && styles.gapPressed]}
      >
        <View style={styles.gapGutter} />
        <View style={styles.hourContent}>
          <View style={styles.gridline} />
          <View style={styles.gapInner}>
            <Text style={styles.gapLabel}>
              {hourLabel(from)} – {hourLabel(to)}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.mutedText} />
          </View>
        </View>
      </Pressable>
    );
  };

  const header = (
    <ScreenHeader
      title={isToday ? 'Today' : formatRelativeDay(dayISO)}
      subtitle={formatWeekdayMonthDay(dayISO)}
      onBack={navigation.goBack}
      right={
        <IconButton
          name="calendar-outline"
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Select a date"
        />
      }
    />
  );

  return (
    <AppShell padded={false} header={header}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {dayEntries.length === 0 ? (
          <Text style={[type.bodyMuted, styles.emptyHint]}>
            No entries for this day yet.
          </Text>
        ) : null}

        {segments.map((seg) =>
          seg.kind === 'hour' ? renderHour(seg.hour) : renderGap(seg.from, seg.to),
        )}
      </ScrollView>

      <CalendarSheet
        visible={pickerOpen}
        selected={day}
        maxDate={now}
        onSelect={(d) => {
          setDayISO(d.toISOString());
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </AppShell>
  );
}

const GUTTER = 56;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  emptyHint: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 64,
  },
  hourLabel: {
    ...type.caption,
    width: GUTTER,
    paddingTop: 2,
  },
  hourContent: {
    flex: 1,
    position: 'relative',
  },
  gridline: {
    position: 'absolute',
    top: 9,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  hourEntries: {
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 40,
  },
  gapPressed: { opacity: 0.6 },
  gapGutter: { width: GUTTER },
  gapInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
  },
  gapLabel: { ...type.caption, color: colors.mutedText },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
    marginVertical: spacing.xs,
  },
  nowLabel: {
    ...type.caption,
    width: GUTTER,
    color: colors.primary,
    fontFamily: fonts.sansMedium,
  },
  nowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  nowLine: {
    flex: 1,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: colors.primary,
    opacity: 0.5,
  },
});
