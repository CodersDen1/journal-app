import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PurchasesPackage } from 'react-native-purchases';

import { api } from '../lib/api';
import {
  addCustomerInfoListener,
  configurePurchases,
  getPackages,
  identify,
  logOutPurchases,
  purchasePackage,
  restorePurchases,
} from '../lib/purchases';
import type { Entitlement } from '../types';
import { useAuth } from './AuthContext';

/** 'loading' until the server's authoritative status is known. */
export type EntitlementStatus = 'loading' | 'active' | 'inactive';

interface EntitlementContextValue {
  /** Authoritative gate signal, resolved from the backend. */
  status: EntitlementStatus;
  entitlement: Entitlement | null;
  /** Purchasable packages from the current RevenueCat offering. */
  packages: PurchasesPackage[];
  /** True while a purchase/restore is in flight. */
  busy: boolean;
  /** Complete a purchase, then let the server re-verify. Throws on failure. */
  purchase: (pkg: PurchasesPackage) => Promise<void>;
  /** Restore prior purchases, then let the server re-verify. */
  restore: () => Promise<void>;
  /** Re-ask the server for the authoritative status. */
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue | undefined>(undefined);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<EntitlementStatus>('loading');
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [busy, setBusy] = useState(false);

  // Bumped on every auth change so a slow in-flight resolution can't clobber the
  // status of a newer user.
  const epochRef = useRef(0);
  // Current user, readable synchronously by callbacks (the SDK listener can fire
  // before the sign-in effect runs).
  const userRef = useRef(user);
  userRef.current = user;

  // The server is the source of truth. `force` re-verifies against RevenueCat
  // (used after a purchase/restore); otherwise it reads the cached status.
  const syncFromServer = useCallback(async (force: boolean) => {
    // No signed-in user → no server identity to resolve; skip (avoids 401s from
    // the SDK listener firing before/after sign-in).
    if (!userRef.current) return;
    const epoch = epochRef.current;
    try {
      const ent = force ? await api.refreshEntitlement() : await api.entitlement();
      if (epoch !== epochRef.current) return;
      setEntitlement(ent);
      setStatus(ent.active ? 'active' : 'inactive');
    } catch {
      // Can't verify → fail closed (paywall). The server independently gates every
      // data request, so this only affects which screen we show.
      if (epoch !== epochRef.current) return;
      setEntitlement(null);
      setStatus('inactive');
    }
  }, []);

  // Configure the SDK once and re-verify whenever CustomerInfo changes (renewals,
  // purchases made outside our flow, restores on other screens).
  useEffect(() => {
    configurePurchases();
    // Routine CustomerInfo changes just re-read the (cached) server status;
    // purchase()/restore() force a fresh RevenueCat re-check themselves.
    const unsubscribe = addCustomerInfoListener(() => void syncFromServer(false));
    return unsubscribe;
  }, [syncFromServer]);

  // Identify the RevenueCat customer to the signed-in user, load offerings, and
  // resolve the authoritative status.
  useEffect(() => {
    epochRef.current += 1;
    let cancelled = false;

    if (!user) {
      setStatus('loading');
      setEntitlement(null);
      setPackages([]);
      void logOutPurchases();
      return;
    }

    setStatus('loading');
    (async () => {
      try {
        await identify(user.uid);
      } catch {
        // Non-fatal: the server still resolves entitlement by Firebase uid.
      }
      getPackages()
        .then((pkgs) => {
          if (!cancelled) setPackages(pkgs);
        })
        .catch(() => undefined);
      await syncFromServer(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, syncFromServer]);

  const purchase = useCallback(
    async (pkg: PurchasesPackage) => {
      setBusy(true);
      try {
        await purchasePackage(pkg);
        await syncFromServer(true);
      } finally {
        setBusy(false);
      }
    },
    [syncFromServer],
  );

  const restore = useCallback(async () => {
    setBusy(true);
    try {
      await restorePurchases();
      await syncFromServer(true);
    } finally {
      setBusy(false);
    }
  }, [syncFromServer]);

  const refresh = useCallback(() => syncFromServer(true), [syncFromServer]);

  const value = useMemo<EntitlementContextValue>(
    () => ({ status, entitlement, packages, busy, purchase, restore, refresh }),
    [status, entitlement, packages, busy, purchase, restore, refresh],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used within an EntitlementProvider');
  return ctx;
}
