import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Linking } from 'react-native';

import { api } from '../lib/api';
import type { BillingPlanKey, Entitlement } from '../types';
import { useAuth } from './AuthContext';

/** 'loading' until the server's authoritative status is known. */
export type EntitlementStatus = 'loading' | 'active' | 'inactive';

interface EntitlementContextValue {
  /** Authoritative gate signal, resolved from the backend. */
  status: EntitlementStatus;
  entitlement: Entitlement | null;
  /** True while a checkout/portal hand-off is being prepared. */
  busy: boolean;
  /** Open Stripe Checkout (hosted) in the browser to buy the given plan. */
  subscribe: (plan: BillingPlanKey) => Promise<void>;
  /** Open the Stripe billing portal to update payment or cancel. */
  manage: () => Promise<void>;
  /** Re-ask the server for the authoritative status. */
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue | undefined>(undefined);

// After returning from Checkout the subscription can take a moment to appear
// (the Stripe webhook usually lands within a second or two). Poll a few times
// before settling on the result.
const POLL_TRIES = 6;
const POLL_DELAY_MS = 2000;

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<EntitlementStatus>('loading');
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [busy, setBusy] = useState(false);

  // Bumped on every auth change so a slow in-flight resolution can't clobber the
  // status of a newer user.
  const epochRef = useRef(0);
  // Current user, readable synchronously by callbacks.
  const userRef = useRef(user);
  userRef.current = user;
  // Set when we hand off to the browser (checkout/portal) so returning to the
  // foreground triggers a re-verify.
  const awaitingReturn = useRef(false);

  // The server is the source of truth. `force` re-verifies against Stripe (used
  // after checkout/portal); otherwise it reads the cached status.
  const syncFromServer = useCallback(async (force: boolean): Promise<Entitlement | null> => {
    if (!userRef.current) return null;
    const epoch = epochRef.current;
    try {
      const ent = force ? await api.refreshEntitlement() : await api.entitlement();
      if (epoch !== epochRef.current) return null;
      setEntitlement(ent);
      setStatus(ent.active ? 'active' : 'inactive');
      return ent;
    } catch {
      if (epoch !== epochRef.current) return null;
      // Can't verify → fail closed (paywall). The server independently gates
      // every data request, so this only affects which screen we show.
      setEntitlement(null);
      setStatus('inactive');
      return null;
    }
  }, []);

  // Resolve the authoritative status on sign-in / sign-out.
  useEffect(() => {
    epochRef.current += 1;
    if (!user) {
      setStatus('loading');
      setEntitlement(null);
      return;
    }
    setStatus('loading');
    void syncFromServer(false);
  }, [user, syncFromServer]);

  // Poll for activation, stopping as soon as the server reports active.
  const pollForActivation = useCallback(async () => {
    for (let i = 0; i < POLL_TRIES; i += 1) {
      const ent = await syncFromServer(true);
      if (ent?.active) return;
      await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
    }
  }, [syncFromServer]);

  // When we come back from the browser (checkout/portal), re-verify.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && awaitingReturn.current) {
        awaitingReturn.current = false;
        void pollForActivation();
      }
    });
    return () => sub.remove();
  }, [pollForActivation]);

  // Ask the server for a hosted Stripe URL and open it. Throws on failure so the
  // caller can surface an alert.
  const openHosted = useCallback(async (getUrl: () => Promise<{ url: string }>) => {
    setBusy(true);
    try {
      const { url } = await getUrl();
      awaitingReturn.current = true;
      await Linking.openURL(url);
    } catch (err) {
      awaitingReturn.current = false;
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const subscribe = useCallback(
    (plan: BillingPlanKey) => openHosted(() => api.createCheckout(plan)),
    [openHosted],
  );
  const manage = useCallback(() => openHosted(() => api.createPortal()), [openHosted]);
  const refresh = useCallback(async () => {
    await syncFromServer(true);
  }, [syncFromServer]);

  const value = useMemo<EntitlementContextValue>(
    () => ({ status, entitlement, busy, subscribe, manage, refresh }),
    [status, entitlement, busy, subscribe, manage, refresh],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used within an EntitlementProvider');
  return ctx;
}
