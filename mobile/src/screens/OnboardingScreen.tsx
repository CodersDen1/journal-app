import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell, PrimaryButton } from '../components';
import { storage } from '../lib/storage';
import type { RootNavigation } from '../navigation/types';
import { colors, radius, spacing, type } from '../theme';

type Step = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    icon: 'create-outline',
    title: 'Document your days.',
    description: 'Capture feelings, moments, and reflections in a calm, private space that’s entirely your own.',
  },
  {
    icon: 'analytics-outline',
    title: 'Notice your patterns.',
    description: 'See how your mood, routines, and habits gently evolve over the weeks and months.',
  },
  {
    icon: 'compass-outline',
    title: 'Make better daily choices.',
    description: 'Use quiet insight to shape more intentional, satisfying days — one reflection at a time.',
  },
];

export function OnboardingScreen() {
  const navigation = useNavigation<RootNavigation>();
  const [activeStep, setActiveStep] = useState(0);
  const step = STEPS[activeStep];
  const isLast = activeStep === STEPS.length - 1;

  // Cross-fade + rise the scene whenever the step changes.
  const scene = useRef(new Animated.Value(1)).current;
  // A gentle, continuous breathe on the medallion — echoes the recording screen.
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scene.setValue(0);
    Animated.timing(scene, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeStep, scene]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const finish = async () => {
    await storage.markOnboardingSeen();
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  const handleContinue = () => {
    if (!isLast) {
      setActiveStep((current) => current + 1);
      return;
    }
    void finish();
  };

  const handleBack = () => {
    if (activeStep > 0) setActiveStep((current) => current - 1);
  };

  const sceneStyle = {
    opacity: scene,
    transform: [
      {
        translateY: scene.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
      },
    ],
  };

  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <AppShell
      padded={false}
      contentContainerStyle={styles.container}
      footer={
        <View style={styles.footer}>
          <PrimaryButton label={isLast ? 'Get started' : 'Continue'} onPress={handleContinue} />
          {activeStep > 0 ? (
            <PrimaryButton label="Back" onPress={handleBack} variant="ghost" />
          ) : null}
        </View>
      }
    >
      <View style={styles.topBar}>
        <Text style={styles.brand}>Still</Text>
        {!isLast ? (
          <Pressable onPress={finish} hitSlop={12} accessibilityRole="button">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.View style={[styles.scene, sceneStyle]}>
        <View style={styles.medallion}>
          <Animated.View
            style={[styles.ring, styles.ringOuter, { transform: [{ scale: breatheScale }] }]}
          />
          <Animated.View
            style={[styles.ring, styles.ringInner, { transform: [{ scale: breatheScale }] }]}
          />
          <View style={styles.iconCircle}>
            <Ionicons name={step.icon} size={44} color={colors.onPrimary} />
          </View>
        </View>

        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>
      </Animated.View>

      <View style={styles.progressRow}>
        {STEPS.map((_, index) => (
          <View
            key={index}
            style={[styles.dot, index === activeStep ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  brand: {
    ...type.greeting,
    fontSize: 22,
    lineHeight: 26,
    color: colors.primaryDark,
  },
  skip: {
    ...type.label,
    color: colors.mutedText,
  },

  // The step scene fills the space between the brand row and the progress dots.
  scene: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallion: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  ring: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  ringOuter: { width: 200, height: 200, opacity: 0.08 },
  ringInner: { width: 148, height: 148, opacity: 0.14 },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 6,
  },
  title: {
    ...type.greeting,
    fontSize: 30,
    lineHeight: 38,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  description: {
    ...type.body,
    color: colors.mutedText,
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 320,
  },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: radius.pill,
  },
  dotActive: {
    width: 28,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 8,
    backgroundColor: colors.border,
  },
  footer: {
    gap: spacing.sm,
  },
});
