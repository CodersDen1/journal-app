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

/** "12 AM", "7 AM", "Noon", "1 PM" … */
function hourLabel(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return 'Noon';
  const period = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12} ${period}`;
}

/** Every hour of the day, midnight → 11 PM. */
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * A vertical, hour-by-hour timeline of a single day (today by default). Every
 * hour of the day is shown; entries sit at the hour they were created and a
 * green "Now" marker shows the current time. Tapping an hour opens the composer
 * seeded to that time; tapping an entry opens it for editing.
 */
export function DayTimelineScreen() {
  const navigation = useAppNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'DayTimeline'>>();
  const { activeEntries } = useJournals();

  const scrollRef = useRef<ScrollView>(null);
  const didAutoScroll = useRef(false);

  const [dayISO, setDayISO] = useState(route.params?.date ?? new Date().toISOString());
  const [pickerOpen, setPickerOpen] = useState(false);
  const day = useMemo(() => new Date(dayISO), [dayISO]);
  const now = new Date();
  const isToday = sameDay(day, now);
  const nowHour = isToday ? now.getHours() : null;

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

  // Where to rest the scroll initially: on "Now" today, else the first entry,
  // else a sensible morning hour so we don't open on empty pre-dawn hours.
  const firstEntryHour = dayEntries.length ? new Date(dayEntries[0].createdAt).getHours() : null;
  const focusHour = nowHour ?? firstEntryHour ?? 7;

  // On day change, allow the next focus layout to re-scroll from the top.
  useEffect(() => {
    didAutoScroll.current = false;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [dayISO]);

  // Scroll the focus hour into view once, leaving a little context above it.
  const onHourLayout = (h: number) => (e: LayoutChangeEvent) => {
    if (h !== focusHour || didAutoScroll.current) return;
    didAutoScroll.current = true;
    const y = e.nativeEvent.layout.y;
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
    );
  };

  // Tapping an hour opens the composer seeded to that time, so the new entry
  // lands in this slot. The current hour keeps the real minutes; other hours
  // start on the hour.
  const createAt = (h: number) => {
    const at = new Date(day);
    at.setHours(h, isToday && h === now.getHours() ? now.getMinutes() : 0, 0, 0);
    navigation.navigate('CreateJournal', { at: at.toISOString(), mode: 'text' });
  };

  const renderHour = (h: number) => {
    const items = byHour[h] ?? [];
    return (
      <React.Fragment key={`h-${h}`}>
        <Pressable
          onPress={() => createAt(h)}
          onLayout={onHourLayout(h)}
          accessibilityRole="button"
          accessibilityLabel={`Add an entry at ${hourLabel(h)}`}
          style={({ pressed }) => [styles.hourRow, pressed && styles.hourPressed]}
        >
          <Text style={styles.hourLabel}>{hourLabel(h)}</Text>
          <View style={styles.hourContent}>
            <View style={styles.gridline} />
            {items.length > 0 ? (
              <View style={styles.hourEntries}>
                {items.map((entry) => (
                  <TimelineEntryCard
                    key={entry.id}
                    entry={entry}
                    onPress={() => navigation.navigate('CreateJournal', { entryId: entry.id })}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.addHint}>
                <Ionicons name="add-circle-outline" size={16} color={colors.mutedText} />
                <Text style={styles.addHintText}>Add note</Text>
              </View>
            )}
          </View>
        </Pressable>

        {nowHour === h ? (
          <View style={styles.nowRow}>
            <Text style={styles.nowLabel}>Now</Text>
            <View style={styles.nowContent}>
              <View style={styles.nowDot} />
              <View style={styles.nowLine} />
            </View>
          </View>
        ) : null}
      </React.Fragment>
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
            No entries for this day yet. Tap any hour to add one.
          </Text>
        ) : null}

        {HOURS.map(renderHour)}
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
  hourPressed: { opacity: 0.55 },
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
  addHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    opacity: 0.5,
  },
  addHintText: { ...type.caption, color: colors.mutedText },
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
