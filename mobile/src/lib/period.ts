/**
 * Periods for Ask — the slice of the journal a question is asked against.
 *
 * Windows are computed here, on the device, and sent to the server as absolute
 * instants. The phone is the only place that knows the user's timezone and
 * which week they stepped back to, so this keeps the days the model reads
 * identical to the days the user sees in the app.
 */
import type { JournalEntry } from '../types';
import { MONTHS } from './format';

export type AskScope = 'week' | 'month' | 'all';

export interface AskPeriod {
  scope: AskScope;
  /** How many whole weeks/months back from the current one. 0 = the one we're in. */
  offset: number;
  /** Inclusive start, ISO-8601. Undefined for 'all'. */
  from?: string;
  /** Exclusive end, ISO-8601. Undefined for 'all'. */
  to?: string;
  /** e.g. "This week", "Last week", "6 – 12 July", "July 2026", "All time". */
  label: string;
}

/** Midnight on the Monday of the week containing `d`, in local time. */
function startOfWeek(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7; // Sunday(0) → 6
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

/** "6 – 12 July", or "29 June – 5 July" when the week straddles two months. */
function weekLabel(from: Date, lastDay: Date): string {
  const fromMonth = MONTHS[from.getMonth()];
  const toMonth = MONTHS[lastDay.getMonth()];
  if (fromMonth === toMonth) {
    return `${from.getDate()} – ${lastDay.getDate()} ${toMonth}`;
  }
  return `${from.getDate()} ${fromMonth} – ${lastDay.getDate()} ${toMonth}`;
}

/**
 * The period `offset` steps back from the current week/month.
 * `now` is injectable for tests.
 */
export function askPeriod(scope: AskScope, offset: number, now: Date = new Date()): AskPeriod {
  if (scope === 'all') {
    return { scope, offset: 0, label: 'All time' };
  }

  if (scope === 'week') {
    const from = startOfWeek(now);
    from.setDate(from.getDate() - offset * 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);

    const lastDay = new Date(to);
    lastDay.setDate(lastDay.getDate() - 1);

    let label: string;
    if (offset === 0) label = 'This week';
    else if (offset === 1) label = 'Last week';
    else label = weekLabel(from, lastDay);

    return { scope, offset, from: from.toISOString(), to: to.toISOString(), label };
  }

  // month — the Date constructor rolls a negative month into the previous year.
  const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);

  let label: string;
  if (offset === 0) label = 'This month';
  else if (offset === 1) label = 'Last month';
  else label = `${MONTHS[from.getMonth()]} ${from.getFullYear()}`;

  return { scope, offset, from: from.toISOString(), to: to.toISOString(), label };
}

/**
 * The entries a question will actually be answered from. Mirrors the server's
 * scoping exactly: everything not deleted, inside [from, to). Archived entries
 * count — archiving tidies the list, it does not mean "forget this happened".
 */
export function entriesInPeriod(entries: JournalEntry[], period: AskPeriod): JournalEntry[] {
  const live = entries.filter((e) => !e.deleted && (e.text.trim() !== '' || e.transcript.trim() !== ''));
  if (period.scope === 'all' || !period.from || !period.to) return live;

  const from = Date.parse(period.from);
  const to = Date.parse(period.to);
  return live.filter((e) => {
    const at = Date.parse(e.createdAt);
    return !Number.isNaN(at) && at >= from && at < to;
  });
}
