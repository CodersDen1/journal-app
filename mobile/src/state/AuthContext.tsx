import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { setAuthTokenGetter } from '../lib/api';
import {
  configureGoogleSignIn,
  fetchIdToken,
  signInWithGoogle as googleSignIn,
  signOutEverywhere,
  subscribeToAuth,
} from '../lib/firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the first auth state is known. */
  initializing: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    configureGoogleSignIn();
    // Let the API client fetch a fresh token for each request.
    setAuthTokenGetter(fetchIdToken);

    const unsubscribe = subscribeToAuth((fbUser) => {
      setUser(
        fbUser
          ? { uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName }
          : null,
      );
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await googleSignIn();
    // The onAuthStateChanged listener updates `user`.
  }, []);

  const signOut = useCallback(async () => {
    await signOutEverywhere();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, signInWithGoogle, signOut }),
    [user, initializing, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
