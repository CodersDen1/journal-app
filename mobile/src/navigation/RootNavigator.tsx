import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { CreateJournalScreen } from '../screens/CreateJournalScreen';
import { JournalDetailScreen } from '../screens/JournalDetailScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ReminderRhythmScreen } from '../screens/ReminderRhythmScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SoftAccountPromptScreen } from '../screens/SoftAccountPromptScreen';
import { BottomTabs } from './BottomTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Root stack: the tab shell plus all pushed and modal screens. */
export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F6F1E8' } }}>
      <Stack.Screen name="Tabs" component={BottomTabs} />

      <Stack.Screen name="JournalDetail" component={JournalDetailScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="ReminderRhythm" component={ReminderRhythmScreen} />

      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="CreateJournal" component={CreateJournalScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Paywall" component={PaywallScreen} />
      </Stack.Group>

      <Stack.Group screenOptions={{ presentation: 'transparentModal', animation: 'fade' }}>
        <Stack.Screen name="SoftAccountPrompt" component={SoftAccountPromptScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
