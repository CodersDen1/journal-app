/**
 * Still — design tokens.
 * Adult, calm, premium, private journal. Warm paper, soft ink, muted sage.
 */

export const colors = {
  background: '#F6F1E8',
  surface: '#FFFFFF',
  softSurface: '#EFE7DA',
  text: '#1F1D1A',
  mutedText: '#7A7369',
  border: '#DDD2C2',
  primary: '#6F7D5A',
  primaryDark: '#4F5D3E',
  secondary: '#B86F52',
  recording: '#9A4F3F',
  // Derived, low-emphasis surfaces used sparingly.
  overlay: 'rgba(31, 29, 26, 0.45)',
  onPrimary: '#FBF8F1',
} as const;

/** 4pt spacing scale. Keep spacing generous — never cramp cards. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Minimum interactive size. Never go below this for tap targets. */
export const hitSize = 44;

export const shadow = {
  /** Soft, low card lift — premium, never harsh. */
  card: {
    shadowColor: '#3A3226',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: '#3A3226',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export type Colors = typeof colors;
