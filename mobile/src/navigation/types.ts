import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TabParamList = {
  Today: undefined;
  Journals: undefined;
  Insights: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  CreateJournal: { entryId?: string; mode?: 'text' | 'voice' } | undefined;
  JournalDetail: { entryId: string };
  Search: undefined;
  Profile: undefined;
  ReminderRhythm: undefined;
  Paywall: undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
