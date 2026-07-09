import type {
  BillingPlan,
  BillingPlanKey,
  Entitlement,
  InsightDigest,
  InsightPeriod,
  JournalEntry,
  ProfileSettings,
} from '../types';

/**
 * Client for the Still backend (Go + Firestore + Gemini).
 *
 * Requests are authenticated with the signed-in user's Firebase ID token,
 * supplied by AuthContext via setAuthTokenGetter. Point BASE_URL at your
 * machine's LAN IP when testing on a device.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

let tokenGetter: ((forceRefresh?: boolean) => Promise<string | null>) | null = null;

/** Wire the Firebase ID-token source (called once by AuthContext). */
export function setAuthTokenGetter(getter: (forceRefresh?: boolean) => Promise<string | null>): void {
  tokenGetter = getter;
}

async function authHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const token = tokenGetter ? await tokenGetter(forceRefresh) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Error thrown for non-2xx responses. `status` lets callers special-case the
 * paywall (402 subscription_required) versus other failures.
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(`API ${status} on ${path}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** True when the error is a 402 (server-enforced paywall). */
export function isPaymentRequired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 402;
}

async function send(path: string, init: RequestInit | undefined, forceRefresh: boolean): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders(forceRefresh)),
    ...(init?.headers ?? {}),
  };
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init, false);
  // A 401 usually means a stale/expired ID token — mint a fresh one and retry once.
  if (res.status === 401 && tokenGetter) {
    res = await send(path, init, true);
  }
  if (!res.ok) {
    throw new ApiError(res.status, path);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Best-effort mime type from a local audio file uri. */
function audioMime(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mp3';
    case 'wav':
      return 'audio/wav';
    case 'aac':
      return 'audio/aac';
    case 'caf':
      return 'audio/x-caf';
    default:
      return 'audio/mp4';
  }
}

export const api = {
  baseUrl: BASE_URL,

  /** URL for the Gemini TTS ("audio of the text") stream for an entry. */
  ttsUrl(entryId: string): string {
    return `${BASE_URL}/api/tts?entryId=${encodeURIComponent(entryId)}`;
  },

  /** URL for the durably-stored original recording of an entry. */
  recordingUrl(entryId: string): string {
    return `${BASE_URL}/api/journals/${encodeURIComponent(entryId)}/recording`;
  },

  async health(): Promise<{ status: string }> {
    return request('/api/health');
  },

  async me(): Promise<{ uid: string; email: string | null }> {
    return request('/api/me');
  },

  /** Authoritative subscription entitlement for the signed-in user. */
  async entitlement(): Promise<Entitlement> {
    return request('/api/entitlement');
  },

  /** Force the server to re-verify entitlement with Stripe (after checkout/portal). */
  async refreshEntitlement(): Promise<Entitlement> {
    return request('/api/entitlement/refresh', { method: 'POST' });
  },

  /** List purchasable plans with live Stripe prices. */
  async billingPlans(): Promise<BillingPlan[]> {
    return request('/api/billing/plans');
  },

  /** Start a Stripe Checkout session for a plan; returns the hosted URL to open. */
  async createCheckout(plan: BillingPlanKey): Promise<{ url: string }> {
    return request('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    });
  },

  /** Open the Stripe billing portal (manage/cancel); returns the hosted URL to open. */
  async createPortal(): Promise<{ url: string }> {
    return request('/api/billing/portal', { method: 'POST' });
  },

  async listEntries(): Promise<JournalEntry[]> {
    return request('/api/journals');
  },

  async createEntry(entry: JournalEntry): Promise<JournalEntry> {
    return request('/api/journals', { method: 'POST', body: JSON.stringify(entry) });
  },

  async updateEntry(entry: JournalEntry): Promise<JournalEntry> {
    return request(`/api/journals/${entry.id}`, { method: 'PUT', body: JSON.stringify(entry) });
  },

  async deleteEntry(id: string): Promise<void> {
    await request(`/api/journals/${id}`, { method: 'DELETE' });
  },

  async insights(period: InsightPeriod): Promise<InsightDigest> {
    return request(`/api/insights?period=${period}`);
  },

  async generateInsight(period: InsightPeriod): Promise<InsightDigest> {
    return request(`/api/insights/generate?period=${period}`, { method: 'POST' });
  },

  async getProfile(): Promise<ProfileSettings> {
    return request('/api/profile');
  },

  async updateProfile(profile: ProfileSettings): Promise<ProfileSettings> {
    return request('/api/profile', { method: 'PUT', body: JSON.stringify(profile) });
  },

  /**
   * Upload a recorded audio file and get a Gemini transcript.
   *
   * Uses XMLHttpRequest rather than fetch: React Native's XHR networking
   * accepts a `{ uri, name, type }` multipart file part, whereas the global
   * fetch (expo/fetch) rejects it with "Unsupported FormDataPart implementation".
   */
  async transcribe(audioUri: string): Promise<string> {
    const headers = await authHeaders();
    const form = new FormData();
    form.append('audio', {
      uri: audioUri,
      name: `entry.${audioUri.split('.').pop() ?? 'm4a'}`,
      type: audioMime(audioUri),
    } as unknown as Blob);

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/api/transcribe`);
      // Do NOT set Content-Type — XHR sets the multipart boundary itself.
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      xhr.timeout = 60000;
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as { transcript?: string };
            resolve(data.transcript ?? '');
          } catch {
            reject(new Error('Invalid transcription response'));
          }
        } else {
          reject(new Error(`API ${xhr.status} on /api/transcribe`));
        }
      };
      xhr.onerror = () => reject(new Error('Network request failed'));
      xhr.ontimeout = () => reject(new Error('Transcription timed out'));
      xhr.send(form);
    });
  },

  /** Upload the original recording so it's stored durably (Firebase Storage). */
  async uploadRecording(entryId: string, audioUri: string): Promise<void> {
    const headers = await authHeaders();
    const form = new FormData();
    form.append('audio', {
      uri: audioUri,
      name: `recording.${audioUri.split('.').pop() ?? 'm4a'}`,
      type: audioMime(audioUri),
    } as unknown as Blob);

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/api/journals/${encodeURIComponent(entryId)}/recording`);
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      xhr.timeout = 60000;
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`API ${xhr.status} on recording upload`));
      };
      xhr.onerror = () => reject(new Error('Network request failed'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));
      xhr.send(form);
    });
  },
};
