import { browser } from "$app/environment";

const TOKEN_KEY = "fantasy-platform:auth-token";
const REFRESH_KEY = "fantasy-platform:auth-refresh";

class AuthStore {
  isLoading = $state(true);
  token = $state<string | null>(null);

  get isAuthenticated() {
    return this.token !== null;
  }

  async fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
    if (forceRefreshToken) {
      // Token refresh via Convex Auth would go here once a refresh endpoint is wired.
      // For now return the stored token as-is; Convex will reject expired tokens and
      // the user will be prompted to sign in again.
    }
    return this.token;
  }

  init() {
    if (!browser) {
      this.isLoading = false;
      return;
    }
    this.token = localStorage.getItem(TOKEN_KEY);
    this.isLoading = false;
  }

  setToken(token: string, refreshToken?: string) {
    this.token = token;
    if (browser) {
      localStorage.setItem(TOKEN_KEY, token);
      if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    }
  }

  clearToken() {
    this.token = null;
    if (browser) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
  }

  signInUrl(siteUrl: string, callbackOrigin: string) {
    const redirectTo = encodeURIComponent(`${callbackOrigin}/auth/callback`);
    return `${siteUrl}/api/auth/signin/google?redirectTo=${redirectTo}`;
  }
}

export const authStore = new AuthStore();
