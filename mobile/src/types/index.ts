/**
 * Still — core data model.
 * Mirrors the Go backend JSON shapes (see server/internal/model).
 */

export type EntryType = 'text' | 'voice';

export interface JournalEntry {
  id: string;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
  type: EntryType;
  /** Written body for text entries. */
  text: string;
  /** Transcript for voice entries (may be mocked). */
  transcript: string;
  /** Local/remote URI to the recorded audio, if a voice entry. */
  audioUri: string | null;
  /** Duration of the recording in seconds. */
  audioDuration: number;
  /** Attached photo URIs. Photos are secondary. */
  photos: string[];
  favorite: boolean;
  archived: boolean;
  deleted: boolean;
}

export type InsightPeriod = 'weekly' | 'monthly';

export interface InsightDigest {
  id: string;
  periodType: InsightPeriod;
  /** Human label, e.g. "This week" or "June 2026". */
  periodLabel: string;
  summary: string;
  patterns: string[];
  emotionalTone: string;
  recommendations: string[];
  suggestedPrompt: string;
  relatedEntryIds: string[];
}

export type Plan = 'free' | 'pro';
export type EntryMode = 'text' | 'voice';

/**
 * Subscription entitlement resolved by the backend from Stripe. This is the
 * authoritative access signal — mirrors the server's model.Entitlement.
 */
export interface Entitlement {
  /** Whether the user currently has active "pro" access (including a free trial). */
  active: boolean;
  /** Stripe price id, e.g. "price_123". */
  productId: string;
  /** "stripe" | "". */
  store: string;
  /** Stripe subscription status, e.g. "active" | "trialing" | "". */
  periodType: string;
  /** ISO-8601 current-period end, or "" when unknown/non-expiring. */
  expiresAt: string;
  willRenew: boolean;
  isTrial: boolean;
  updatedAt: string;
  source: string;
  /** Stripe customer id; "" until a checkout has completed. */
  stripeCustomerId: string;
}

export type BillingPlanKey = 'monthly' | 'yearly' | 'lifetime';

/** A purchasable plan with its live Stripe price (from GET /api/billing/plans). */
export interface BillingPlan {
  key: BillingPlanKey;
  /** "subscription" (recurring) or "payment" (one-time, e.g. lifetime). */
  mode: 'subscription' | 'payment';
  priceId: string;
  /** Amount in the currency's smallest unit (e.g. cents); 0 when unavailable. */
  amount: number;
  currency: string;
  /** "month" | "year" for subscriptions; "" for one-time. */
  interval: string;
}
export type ReminderRhythm = 'off' | 'daily' | 'weekdays' | 'weekends' | 'custom';

export interface ProfileSettings {
  accountEmail: string | null;
  plan: Plan;
  appLockEnabled: boolean;
  backupEnabled: boolean;
  defaultEntryMode: EntryMode;
  transcriptionLanguage: string;
  textToSpeechVoice: string;
  reminderRhythm: ReminderRhythm;
  missedYesterdayNudge: boolean;
}

/** Draft shape used when creating a new entry before it is persisted. */
export interface NewEntryInput {
  type: EntryType;
  text?: string;
  transcript?: string;
  audioUri?: string | null;
  audioDuration?: number;
  photos?: string[];
  /** Override the creation time (e.g. an hour tapped on the day timeline). */
  createdAt?: string;
}
