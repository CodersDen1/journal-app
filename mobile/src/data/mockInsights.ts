import type { InsightDigest, InsightPeriod } from '../types';

/**
 * Mocked AI insight digests. In the MVP these are static; the Go backend can
 * generate them from real entries later. Tone is quiet and observational —
 * never clinical, never a chatbot.
 */
export const mockInsights: Record<InsightPeriod, InsightDigest> = {
  weekly: {
    id: 'insight-weekly',
    periodType: 'weekly',
    periodLabel: 'This week',
    summary:
      'A steadier week than the last. Your mornings anchored you — several entries begin in quiet and end with a small decision to protect that quiet. Evenings were where the weight showed up, and where you tended to work it out by moving or talking.',
    patterns: [
      'You write most often in the early morning, before the day makes demands.',
      'Walks and conversations reliably lift your mood in the entries that follow them.',
      'You are gentler with yourself after a poor night than you used to be.',
    ],
    emotionalTone: 'Calm, quietly proud, occasionally tired',
    recommendations: [
      'Keep the slow morning hour — it appears in nearly every good day you recorded.',
      'When a worry lingers, naming it to someone seems to shrink it. Worth doing sooner.',
    ],
    suggestedPrompt: 'What did you protect this week, and what did you let go of?',
    relatedEntryIds: ['seed-1', 'seed-2', 'seed-5'],
  },
  monthly: {
    id: 'insight-monthly',
    periodType: 'monthly',
    periodLabel: 'June 2026',
    summary:
      'June reads as a month of reclaiming pace. Again and again you notice slowness — cooking, walking, the coast — and treat it as something earned rather than lost. Work pressure appears but rarely dominates; you tend to close those entries with a note of steadiness.',
    patterns: [
      'Slowness is your recurring theme this month — you return to it in a third of your entries.',
      'You record more on weekends and after time outdoors.',
      'Pride shows up specifically around staying calm under pressure.',
    ],
    emotionalTone: 'Reflective, grounded, hopeful',
    recommendations: [
      'Protect one unhurried day each week — the entries around them are your warmest.',
      'You process work stress well in voice notes. Consider reaching for them on hard days.',
    ],
    suggestedPrompt: 'Where did you feel most like yourself this month?',
    relatedEntryIds: ['seed-3', 'seed-4', 'seed-6'],
  },
};
