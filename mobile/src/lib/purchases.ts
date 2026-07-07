import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * RevenueCat SDK wrapper.
 *
 * The client SDK drives the purchase UX only; the server is the source of truth
 * for access (see EntitlementContext, which trusts GET /api/entitlement). Public
 * SDK keys are safe to ship in the app. When no key is configured (e.g. local
 * dev without RevenueCat) the SDK is left un-configured and the app falls back
 * to the server's entitlement status.
 *
 * Requires a development build — the native module does not run in Expo Go.
 */
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

/** Entitlement identifier configured in the RevenueCat dashboard. */
export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'pro';

const apiKey = Platform.select({ ios: IOS_KEY, android: ANDROID_KEY, default: '' }) ?? '';

let configured = false;

/** Whether a RevenueCat key is present and the SDK has been configured. */
export function isConfigured(): boolean {
  return configured;
}

/** Configure the SDK once. No-op (returns false) when no key is set. */
export function configurePurchases(): boolean {
  if (configured) return true;
  if (!apiKey) return false;
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  configured = true;
  return true;
}

/** Link the RevenueCat customer to the app's (Firebase) user id. */
export async function identify(uid: string): Promise<void> {
  if (!configured) return;
  await Purchases.logIn(uid);
}

/** Detach the RevenueCat customer on sign-out. No-op when already anonymous. */
export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  try {
    if (await Purchases.isAnonymous()) return; // nothing to log out
    await Purchases.logOut();
  } catch {
    // logOut throws for an already-anonymous user — safe to ignore.
  }
}

/** Packages of the current offering, or [] when unavailable. */
export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  const current: PurchasesOffering | null = offerings.current;
  return current?.availablePackages ?? [];
}

/** Purchase a package. Rejects on error; `userCancelled` is set when cancelled. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

/** Restore prior purchases and return the refreshed customer info. */
export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/** Fetch the latest customer info from the SDK cache/store. */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  return Purchases.getCustomerInfo();
}

/**
 * Subscribe to CustomerInfo changes (fires after purchases, renewals, restores).
 * Returns an unsubscribe function.
 */
export function addCustomerInfoListener(cb: (info: CustomerInfo) => void): () => void {
  if (!configured) return () => undefined;
  Purchases.addCustomerInfoUpdateListener(cb);
  return () => Purchases.removeCustomerInfoUpdateListener(cb);
}

/** Whether the given customer info grants the gated entitlement. */
export function hasProEntitlement(info: CustomerInfo | null | undefined): boolean {
  return Boolean(info?.entitlements.active[ENTITLEMENT_ID]);
}
