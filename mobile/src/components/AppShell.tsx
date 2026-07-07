import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

type Background = 'background' | 'surface' | 'softSurface';

interface AppShellProps {
  children: React.ReactNode;
  /** Fixed content at the top, below the status bar (usually a ScreenHeader). */
  header?: React.ReactNode;
  /** Fixed content pinned above the home indicator (usually a PrimaryButton). */
  footer?: React.ReactNode;
  /** Wrap children in a ScrollView. Default false. */
  scroll?: boolean;
  /** Apply horizontal screen padding to the body. Default true. */
  padded?: boolean;
  background?: Background;
  contentContainerStyle?: ViewStyle;
  /** Ref to the internal ScrollView (scroll screens only), e.g. to scroll a
   *  focused input into view above the keyboard. */
  scrollRef?: React.Ref<ScrollView>;
}

/**
 * The base screen frame. Handles safe areas, background, horizontal padding,
 * and optional fixed header/footer. Footers are kept clear of the home
 * indicator so buttons never sit on top of it.
 */
export function AppShell({
  children,
  header,
  footer,
  scroll = false,
  padded = true,
  background = 'background',
  contentContainerStyle,
  scrollRef,
}: AppShellProps) {
  const insets = useSafeAreaInsets();
  const horizontal = padded ? spacing.xl : 0;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors[background], paddingTop: insets.top }]}
      // 'padding' lifts the whole column (footer included) above the keyboard on
      // iOS; Android relies on window resize. Scroll screens additionally scroll
      // the focused input into view (see scrollRef).
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header ? <View style={styles.header}>{header}</View> : null}

      {scroll ? (
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            {
              paddingHorizontal: horizontal,
              paddingBottom: spacing.xxl + (footer ? 0 : insets.bottom),
            },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { paddingHorizontal: horizontal }, contentContainerStyle]}>
          {children}
        </View>
      )}

      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.xl },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'transparent',
  },
});
