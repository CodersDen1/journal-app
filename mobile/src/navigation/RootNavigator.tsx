import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { AskScreen } from '../screens/AskScreen';
import { CreateJournalScreen } from '../screens/CreateJournalScreen';
import { DayTimelineScreen } from '../screens/DayTimelineScreen';
import { JournalDetailScreen } from '../screens/JournalDetailScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ReminderRhythmScreen } from '../screens/ReminderRhythmScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { BottomTabs } from './BottomTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Root stack: the tab shell plus all pushed and modal screens. */
interface RootNavigatorProps {
  initialRouteName?: keyof RootStackParamList;
}

export function RootNavigator({ initialRouteName = 'Tabs' }: RootNavigatorProps) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F6F1E8' } }}
    >
      <Stack.Screen name="Tabs" component={BottomTabs} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />

      <Stack.Screen name="JournalDetail" component={JournalDetailScreen} />
      <Stack.Screen name="DayTimeline" component={DayTimelineScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="ReminderRhythm" component={ReminderRhythmScreen} />

      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="CreateJournal" component={CreateJournalScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Ask" component={AskScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
