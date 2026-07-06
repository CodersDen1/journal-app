import AsyncStorage from '@react-native-async-storage/async-storage';

import type { JournalEntry, ProfileSettings } from '../types';

/**
 * Local persistence. The app works fully offline against these keys;
 * the Go backend is optional (see api.ts).
 */

const KEYS = {
  entries: 'still.entries.v1',
  profile: 'still.profile.v1',
  seeded: 'still.seeded.v1',
} as const;

async function readJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort; ignore write failures in the MVP.
  }
}

export const storage = {
  async loadEntries(): Promise<JournalEntry[] | null> {
    return readJSON<JournalEntry[]>(KEYS.entries);
  },
  async saveEntries(entries: JournalEntry[]): Promise<void> {
    return writeJSON(KEYS.entries, entries);
  },
  async loadProfile(): Promise<ProfileSettings | null> {
    return readJSON<ProfileSettings>(KEYS.profile);
  },
  async saveProfile(profile: ProfileSettings): Promise<void> {
    return writeJSON(KEYS.profile, profile);
  },
  async hasSeeded(): Promise<boolean> {
    const v = await AsyncStorage.getItem(KEYS.seeded);
    return v === 'true';
  },
  async markSeeded(): Promise<void> {
    await AsyncStorage.setItem(KEYS.seeded, 'true');
  },
  async reset(): Promise<void> {
    await AsyncStorage.multiRemove([KEYS.entries, KEYS.profile, KEYS.seeded]);
  },
};
