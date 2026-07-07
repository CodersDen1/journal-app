import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadow, spacing, type } from '../theme';
import { IconButton } from './IconButton';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface CalendarSheetProps {
  visible: boolean;
  /** Currently selected day. */
  selected: Date;
  /** Latest selectable day (later days are disabled). Defaults to unbounded. */
  maxDate?: Date;
  onSelect: (day: Date) => void;
  onClose: () => void;
}

/**
 * A calm, self-contained month calendar in a modal — no native date-picker
 * dependency. Future days (after maxDate) are disabled.
 */
export function CalendarSheet({ visible, selected, maxDate, onSelect, onClose }: CalendarSheetProps) {
  const today = startOfDay(new Date());
  const max = maxDate ? startOfDay(maxDate) : null;
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );

  // Re-centre on the selected month each time the sheet opens.
  useEffect(() => {
    if (visible) setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [visible, selected]);

  const weeks = useMemo(() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const offset = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let d = 1; d <= days; d += 1) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewMonth]);

  const atMaxMonth =
    !!max &&
    viewMonth.getFullYear() === max.getFullYear() &&
    viewMonth.getMonth() === max.getMonth();

  const stepMonth = (delta: number) =>
    setViewMonth((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Stop taps inside the card from closing the sheet. */}
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.monthRow}>
            <IconButton name="chevron-back" onPress={() => stepMonth(-1)} accessibilityLabel="Previous month" />
            <Text style={styles.monthLabel}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </Text>
            <IconButton
              name="chevron-forward"
              onPress={() => stepMonth(1)}
              disabled={atMaxMonth}
              accessibilityLabel="Next month"
            />
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={styles.weekday}>
                {w}
              </Text>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((cell, ci) => {
                if (!cell) return <View key={ci} style={styles.cell} />;
                const isFuture = !!max && cell > max;
                const isSelected = sameDay(cell, selected);
                const isToday = sameDay(cell, today);
                return (
                  <Pressable
                    key={ci}
                    style={styles.cell}
                    disabled={isFuture}
                    onPress={() => onSelect(cell)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled: isFuture }}
                  >
                    <View
                      style={[
                        styles.dayCircle,
                        isSelected && styles.daySelected,
                        !isSelected && isToday && styles.dayToday,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          isSelected && styles.dayTextSelected,
                          isFuture && styles.dayTextDim,
                        ]}
                      >
                        {cell.getDate()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Pressable
            onPress={() => onSelect(new Date())}
            accessibilityRole="button"
            style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
          >
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.floating,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  monthLabel: { ...type.heading },
  weekRow: { flexDirection: 'row' },
  weekday: {
    ...type.caption,
    flex: 1,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  cell: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  dayText: { ...type.body, color: colors.text },
  dayTextSelected: { color: colors.onPrimary, fontFamily: fonts.sansMedium },
  dayTextDim: { color: colors.border },
  todayButton: {
    marginTop: spacing.md,
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.softSurface,
  },
  todayText: { ...type.label, color: colors.primaryDark },
  pressed: { opacity: 0.7 },
});
