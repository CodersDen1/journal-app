import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadow, spacing, type } from '../theme';
import { InsightsScreen } from '../screens/InsightsScreen';
import { JournalsScreen } from '../screens/JournalsScreen';
import { TodayScreen } from '../screens/TodayScreen';
import type { IoniconName } from '../components';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const TAB_H = 50; // taller row → more vertical padding inside the pill
const PILL_INSET_X = spacing.sm; // horizontal breathing room: pill ↔ slot edge
const PILL_INSET_Y = 5; // vertical breathing room: pill ↔ row edge

const TAB_META: Record<keyof TabParamList, { label: string; icon: IoniconName; iconActive: IoniconName }> = {
  Today: { label: 'Today', icon: 'today-outline', iconActive: 'today' },
  Journals: { label: 'Journals', icon: 'book-outline', iconActive: 'book' },
  Insights: { label: 'Insights', icon: 'sparkles-outline', iconActive: 'sparkles' },
};

/**
 * Floating-pill bottom tab bar. A green pill springs between the equal slots
 * with a bouncy overshoot and a little scale "pop" on landing; the active tab
 * reveals its label.
 *
 * IMPORTANT: only `transform` and `opacity` are animated, on the NATIVE driver.
 * Expo SDK 57 / RN 0.86 run the new architecture (Fabric), where JS-driven
 * animation of layout props (`width`) or `color` crashes via setNativeProps.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const count = state.routes.length;

  // Measured inner width of the row → one equal slot per destination.
  const [rowWidth, setRowWidth] = useState(0);
  const slot = rowWidth > 0 ? rowWidth / count : 0;

  // Continuous position (in slot units) that springs to the active index, plus
  // a scale that pops on each switch. Both drive transforms only (native-safe).
  const pos = useRef(new Animated.Value(state.index)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Snappy slide with a bouncy overshoot, clamped at the ends so it can't
    // poke past the capsule.
    Animated.spring(pos, {
      toValue: state.index,
      useNativeDriver: true,
      stiffness: 190,
      damping: 10, // lower damping → more positional bounce
      mass: 1,
    }).start();

    // The bounce that reads on EVERY tab: the pill quickly grows, then springs
    // back down past its size and rubber-bands a few times before settling.
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.2,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 240,
        damping: 6, // very springy settle → multiple visible bounces
        mass: 1,
      }),
    ]).start();
  }, [state.index, pos, scale]);

  const onRowLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width);
  const input = state.routes.map((_, i) => i);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }]}>
      <View style={styles.bar}>
        <View style={styles.row} onLayout={onRowLayout}>
          {slot > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pill,
                {
                  width: slot - PILL_INSET_X * 2,
                  transform: [
                    {
                      translateX: pos.interpolate({
                        inputRange: input,
                        outputRange: input.map((i) => i * slot + PILL_INSET_X),
                        extrapolate: 'clamp', // bounce never pokes past the capsule
                      }),
                    },
                    { scale },
                  ],
                },
              ]}
            />
          ) : null}

          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const meta = TAB_META[route.name as keyof TabParamList];

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };

            // Wide "1" plateau so the spring overshoot doesn't flicker the label.
            const labelOpacity = pos.interpolate({
              inputRange: [index - 0.6, index - 0.4, index + 0.4, index + 0.6],
              outputRange: [0, 1, 1, 0],
              extrapolate: 'clamp',
            });

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
                  size={22}
                  color={focused ? colors.primaryDark : colors.mutedText}
                />
                {focused ? (
                  <Animated.Text
                    style={[styles.labelActive, { opacity: labelOpacity }]}
                    numberOfLines={1}
                  >
                    {meta.label}
                  </Animated.Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
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
  // Transparent gutter so the capsule floats over the screen background.
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: 'transparent',
  },
  bar: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    ...shadow.floating,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  // The single sliding highlight — inset on all sides so it reads as a floating
  // chip with even margins, never crowding the capsule's rounded ends.
  pill: {
    position: 'absolute',
    top: PILL_INSET_Y,
    bottom: PILL_INSET_Y,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(111, 125, 90, 0.16)',
  },
  tab: {
    flex: 1,
    minHeight: TAB_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs, // tighter icon↔label so labels fit inside the inset pill
  },
  labelActive: {
    ...type.label,
    color: colors.primaryDark,
  },
});
