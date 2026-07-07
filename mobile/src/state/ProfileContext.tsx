import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { defaultProfile } from '../data/mockProfile';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import type { ProfileSettings } from '../types';
import { useAuth } from './AuthContext';

interface ProfileContextValue {
  loading: boolean;
  profile: ProfileSettings;
  /** Shallow-merge a change into settings; persists locally and to the backend when signed in. */
  update: (patch: Partial<ProfileSettings>) => void;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileSettings>(defaultProfile);
  const [loading, setLoading] = useState(true);
  const profileRef = useRef(profile);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Reconcile settings whenever auth state changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (user) {
        let next: ProfileSettings;
        try {
          next = await api.getProfile();
        } catch {
          next = (await storage.loadProfile()) ?? defaultProfile;
        }
        if (cancelled) return;
        const merged: ProfileSettings = { ...defaultProfile, ...next, accountEmail: user.email };
        setProfile(merged);
        void storage.saveProfile(merged);
      } else {
        const saved = await storage.loadProfile();
        if (cancelled) return;
        setProfile(saved ? { ...defaultProfile, ...saved, accountEmail: null } : defaultProfile);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = useCallback(
    (patch: Partial<ProfileSettings>) => {
      const merged = { ...profileRef.current, ...patch };
      profileRef.current = merged;
      setProfile(merged);
      void storage.saveProfile(merged);
      if (user) void api.updateProfile(merged).catch(() => undefined);
    },
    [user],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({ loading, profile, update }),
    [loading, profile, update],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}
