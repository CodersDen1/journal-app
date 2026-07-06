import {
  getAuth,
  getIdToken as getIdTokenModular,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

/**
 * Firebase Auth + native Google Sign-In.
 *
 * Requires a development build (react-native-firebase and google-signin use
 * native modules — they do NOT run in Expo Go). The web client id comes from
 * your Firebase project's OAuth config; set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
 */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

/** The subset of the Firebase user the app consumes. */
export interface FirebaseUserLike {
  uid: string;
  email: string | null;
  displayName: string | null;
}

let configured = false;

export function configureGoogleSignIn(): void {
  if (configured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  configured = true;
}

/** Native Google sign-in, exchanged for a Firebase credential. */
export async function signInWithGoogle(): Promise<void> {
  configureGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  const idToken = response.type === 'success' ? response.data.idToken : null;
  if (!idToken) {
    throw new Error('Google sign-in was cancelled.');
  }

  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(getAuth(), credential);
}

export async function signOutEverywhere(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Ignore — the Google session may already be gone.
  }
  await firebaseSignOut(getAuth());
}

export function subscribeToAuth(callback: (user: FirebaseUserLike | null) => void): () => void {
  return onAuthStateChanged(getAuth(), (user) =>
    callback(user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null),
  );
}

/** Fresh Firebase ID token for the signed-in user, or null. */
export async function fetchIdToken(): Promise<string | null> {
  const user = getAuth().currentUser;
  if (!user) return null;
  return getIdTokenModular(user);
}
