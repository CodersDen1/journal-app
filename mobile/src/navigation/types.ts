import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TabParamList = {
  Today: undefined;
  Journals: undefined;
  Insights: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  CreateJournal:
    | {
        entryId?: string;
        mode?: 'text' | 'voice';
        audioUri?: string;
        audioDuration?: number;
        /** Seed timestamp (ISO) for a new entry — e.g. an hour tapped on the day timeline. */
        at?: string;
      }
    | undefined;
  JournalDetail: { entryId: string };
  Search: undefined;
  Profile: undefined;
  ReminderRhythm: undefined;
  /** Hour-by-hour timeline for a single day (defaults to today). */
  DayTimeline: { date?: string } | undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
