import { useNavigation } from '@react-navigation/native';

import type { RootNavigation } from './types';

/** Typed navigation hook for the root stack. Use everywhere for navigation. */
export function useAppNavigation(): RootNavigation {
  return useNavigation<RootNavigation>();
}
