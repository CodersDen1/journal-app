import { Platform, TextStyle } from 'react-native';

import { colors } from './tokens';

/**
 * Font families.
 * IBM Plex Sans for UI, Literata for journal content.
 * These names match the @expo-google-fonts exports loaded in App.tsx.
 * If fonts fail to load, the app falls back to the system font gracefully.
 */
export const fonts = {
  sansRegular: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemiBold: 'IBMPlexSans_600SemiBold',
  serifRegular: 'Literata_400Regular',
  serifMedium: 'Literata_500Medium',
} as const;

const systemFallback = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' });

/**
 * Typography presets. Use `type` for the family/size/weight of a piece of text.
 * `sans*` → UI. `serif*` → journal reading content.
 */
export const type = {
  // UI — IBM Plex Sans
  greeting: {
    fontFamily: fonts.serifMedium,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
  } as TextStyle,
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
  } as TextStyle,
  heading: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
  } as TextStyle,
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  } as TextStyle,
  bodyMuted: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.mutedText,
  } as TextStyle,
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  } as TextStyle,
  caption: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.mutedText,
  } as TextStyle,
  overline: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.mutedText,
  } as TextStyle,
  // Reading — Literata
  reading: {
    fontFamily: fonts.serifRegular,
    fontSize: 18,
    lineHeight: 30,
    color: colors.text,
  } as TextStyle,
  readingPreview: {
    fontFamily: fonts.serifRegular,
    fontSize: 16,
    lineHeight: 25,
    color: colors.text,
  } as TextStyle,
} as const;

/** System fallback family, exposed for any manual style that must not depend on loaded fonts. */
export const systemFont = systemFallback;
