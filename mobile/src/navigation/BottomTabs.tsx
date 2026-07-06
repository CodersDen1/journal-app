import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, hitSize, spacing, type } from '../theme';
import { InsightsScreen } from '../screens/InsightsScreen';
import { JournalsScreen } from '../screens/JournalsScreen';
import { TodayScreen } from '../screens/TodayScreen';
import type { IoniconName } from '../components';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const TAB_META: Record<keyof TabParamList, { label: string; icon: IoniconName; iconActive: IoniconName }> = {
  Today: { label: 'Today', icon: 'today-outline', iconActive: 'today' },
  Journals: { label: 'Journals', icon: 'book-outline', iconActive: 'book' },
  Insights: { label: 'Insights', icon: 'sparkles-outline', iconActive: 'sparkles' },
};

/** Custom bottom tab bar — calm, three destinations, generous tap targets. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const meta = TAB_META[route.name as keyof TabParamList];

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            style={styles.tab}
          >
            <Ionicons
              name={focused ? meta.iconActive : meta.icon}
              size={24}
              color={focused ? colors.primaryDark : colors.mutedText}
            />
            <Text style={[type.caption, styles.label, focused && styles.labelActive]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Journals" component={JournalsScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    minHeight: hitSize,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: { color: colors.mutedText },
  labelActive: { color: colors.primaryDark },
});
