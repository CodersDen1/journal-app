import type { ProfileSettings } from '../types';

/** Default profile used before the user changes anything. */
export const defaultProfile: ProfileSettings = {
  accountEmail: null,
  plan: 'free',
  appLockEnabled: false,
  backupEnabled: false,
  defaultEntryMode: 'text',
  transcriptionLanguage: 'English (US)',
  textToSpeechVoice: 'Warm',
  reminderRhythm: 'daily',
  missedYesterdayNudge: true,
};
