import { browser } from "$app/environment";
import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  type Auth,
  type User,
} from "firebase/auth";

/**
 * Auth store backed by Firebase Auth.
 *
 * Shape is dictated by `setupAuth()` in convex-svelte, which needs
 * `{ isLoading, isAuthenticated, fetchAccessToken }`. Firebase's SDK owns
 * session persistence and token refresh, so `fetchAccessToken` is a thin
 * pass-through — `getIdToken(forceRefresh)` maps directly onto the
 * `forceRefreshToken` flag Convex passes in.
 *
 * Convex validates these ID tokens as a plain OIDC provider (see
 * convex/auth.config.ts). No session cookie, no firebase-admin, no server round
 * trip — a simplification over fantasy-tds's cookie-based model.
 *
 * The same three-value contract is what ConvexMobile's `AuthProvider` protocol
 * wants on iOS, over Firebase's native SDK. See
 * docs/decisions/0001-auth-provider-and-native-clients.md.
 */
class AuthStore {
  isLoading = $state(true);
  isAuthenticated = $state(false);
  /** `$state.raw` — a Firebase `User` is a class instance; don't deep-proxy it. */
  user = $state.raw<User | null>(null);

  #auth: Auth | null = null;

  init(config: FirebaseOptions) {
    if (!browser) {
      this.isLoading = false;
      return;
    }
    if (!config.apiKey || !config.projectId) {
      console.warn("[auth] PUBLIC_FIREBASE_* env vars are unset — auth disabled.");
      this.isLoading = false;
      return;
    }

    const app = getApps().length ? getApps()[0] : initializeApp(config);
    this.#auth = getAuth(app);

    // Fires once on load with the restored session (or null), then on every
    // sign-in and sign-out. Resolving isLoading here avoids a flash of the
    // signed-out UI for an already-authenticated user.
    onAuthStateChanged(this.#auth, (user) => {
      this.user = user;
      this.isAuthenticated = user !== null;
      this.isLoading = false;
    });
  }

  async fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
    const user = this.#auth?.currentUser;
    if (!user) return null;
    return await user.getIdToken(forceRefreshToken);
  }

  async signIn() {
    if (!this.#auth) return;
    await signInWithPopup(this.#auth, new GoogleAuthProvider());
  }

  async signOut() {
    if (!this.#auth) return;
    await signOut(this.#auth);
  }
}

export const authStore = new AuthStore();
