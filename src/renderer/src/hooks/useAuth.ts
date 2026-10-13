import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { jwtDecode } from "jwt-decode";
import { login as apiLogin } from "../api/halo";
import {
  isSessionEnded,
  migratePasswordToRefreshToken,
  reauthenticate,
  type FreshCreds,
} from "../api/auth";
import { setCachedCreds, resetClientGuards } from "../api/client";
import { errorMessage } from "../../../shared/errors";
import type { ThunderBiometricUnlockResult } from "../../../preload/thunder-api";
import { queryClient } from "../api/cache";
import { RANDOM_RECORDS_KEY } from "./useRecords";
import { useTabHistory } from "./useTabHistory";
import { useChatActions } from "@swaff-y/thunder-chat-core";
import React from "react";

interface JwtPayload {
  sub: string;
  exp: number;
}

interface AuthState {
  token: string | null;
  apiKey: string | null;
  userId: string | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * TD-094: the launch gate. True only when the setting is on, Touch ID
   * is available and a session is stored — and false whenever any of the
   * three can't be read, because a lock that engages by accident is
   * worse than no lock.
   */
  isLocked: boolean;
  login: (email: string, password: string, staySignedIn?: boolean) => Promise<void>;
  /** TD-094: the gate's prompt. Resolves false on a dismissal, which leaves it armed. */
  unlockApp: () => Promise<boolean>;
  /**
   * TD-094: Touch ID in place of the login form. Resolves with the
   * failure rather than throwing, so the login screen can tell a
   * dismissal from a changed password.
   */
  loginWithBiometric: () => Promise<ThunderBiometricUnlockResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_STATE: AuthState = { token: null, apiKey: null, userId: null };

function isTokenValid(token: string): boolean {
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function decodeUserId(token: string): string | null {
  try {
    return jwtDecode<JwtPayload>(token).sub;
  } catch {
    return null;
  }
}

/** The state a freshly minted access token puts the provider in. */
function signedInState(creds: FreshCreds): AuthState {
  return {
    token: creds.token,
    apiKey: creds.apiKey,
    userId: decodeUserId(creds.token),
  };
}

// One-shot migration: copy any pre-TD-030 localStorage tokens into the
// keychain and wipe the localStorage keys so we never read them again.
// Pre-030 builds didn't store the email or a credential — without one,
// silent reauth can't fire, so the migrated record is a one-shot session
// that will end at JWT expiry like the old behaviour. The user gets a
// proper "Stay signed in" record on their next explicit login.
async function migrateFromLocalStorage(): Promise<{
  token: string;
  apiKey: string;
} | null> {
  const token = localStorage.getItem("userToken");
  const apiKey = localStorage.getItem("apiKey");
  if (!token || !apiKey) return null;

  try {
    await window.thunder?.auth.set({ token, apiKey });
  } catch (error) {
    console.error("[useAuth] localStorage migration failed:", errorMessage(error));
    return null;
  }
  localStorage.removeItem("userToken");
  localStorage.removeItem("apiKey");
  return { token, apiKey };
}

/**
 * TD-094: all three conditions, and a `false` for any one of them that
 * can't be read. The settings read, the support probe and the stored
 * session are each a separate way to fail open.
 */
async function shouldLockLaunch(): Promise<boolean> {
  try {
    // The setting first, and the native probe only if it is on: the flag
    // ships false, so the common boot pays one settings read rather than
    // a `canPromptTouchID` round trip it will discard.
    const required = await window.thunder?.settings.get("requireTouchIdOnLaunch");
    if (required !== true) return false;
    const status = await window.thunder?.auth.biometric.status();
    return status?.supported === true;
  } catch (error) {
    console.error("[useAuth] launch-gate check failed:", errorMessage(error));
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [lockArmed, setLockArmed] = useState(false);
  const { clearHistory: clearTabHistory } = useTabHistory();
  const { clear: clearChat } = useChatActions();

  const isAuthenticated = !!state.token && isTokenValid(state.token);
  // TD-094: derived, not synchronised. A record that turns out to be a
  // dead session clears itself in the boot check below and the gate opens
  // onto the login form — locking a user out of a session they no longer
  // have would leave them nothing to unlock.
  const isLocked = lockArmed && isAuthenticated;

  // Boot check
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        let creds = await window.thunder?.auth.get();

        if (!creds) {
          const migrated = await migrateFromLocalStorage();
          if (migrated) {
            creds = { ...migrated };
          }
        }

        if (cancelled) return;

        // TD-094: before any of the branches below, so every path that
        // ends signed in is gated — and only when a session is actually
        // stored, so a logged-out launch is never locked out of the form.
        const lockLaunch = creds ? await shouldLockLaunch() : false;
        if (cancelled) return;
        if (lockLaunch) setLockArmed(true);

        // TD-093: a record from before this ticket carries the user's
        // password and no refresh token. Trade it for one — a single
        // `v1/login` the user never sees — and the password is gone from
        // disk for good. A failed migration is a re-login, not a reason to
        // keep the password another cycle.
        if (creds?.email && creds.password && !creds.refreshToken) {
          try {
            const fresh = await migratePasswordToRefreshToken(creds.email, creds.password);
            if (cancelled) return;
            setState(signedInState(fresh));
            return;
          } catch (error) {
            console.error("[useAuth] refresh-token migration failed:", errorMessage(error));
            await window.thunder?.auth.clear();
            if (!cancelled) setCachedCreds(null);
            return;
          }
        }

        if (creds && isTokenValid(creds.token)) {
          setCachedCreds({ token: creds.token, apiKey: creds.apiKey });
          setState(signedInState(creds));
          return;
        }

        if (creds?.refreshToken) {
          try {
            const fresh = await reauthenticate();
            if (cancelled) return;
            setState(signedInState(fresh));
            return;
          } catch (error) {
            // TD-093: only a revoked/expired refresh token clears the
            // record. A boot while the backend is busy or the laptop is
            // offline falls through to logged-out for this launch and
            // leaves the credential in place to try again.
            if (isSessionEnded(error)) await window.thunder?.auth.clear();
          }
        } else if (creds) {
          // expired token, no refresh token — clear silently.
          await window.thunder?.auth.clear();
        }

        if (!cancelled) setCachedCreds(null);
      } catch (error) {
        console.error("[useAuth] boot check failed:", errorMessage(error));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * TD-094: the transition a fresh session puts the app through,
   * extracted so a Touch ID sign-in and a typed one cannot drift —
   * identical cached creds, cleared guards and cache invalidation.
   */
  const adoptSession = useCallback((creds: FreshCreds) => {
    setCachedCreds(creds);
    resetClientGuards();
    queryClient.invalidateQueries({ queryKey: RANDOM_RECORDS_KEY });
    setState(signedInState(creds));
  }, []);

  const login = useCallback(
    async (email: string, password: string, staySignedIn = true) => {
      const response = await apiLogin(email, password);
      const { access_token, api_key, refresh_token } = response.data;

      await window.thunder?.auth.set({
        token: access_token,
        apiKey: api_key,
        email,
        refreshToken: staySignedIn ? refresh_token : undefined,
      });
      adoptSession({ token: access_token, apiKey: api_key });
    },
    [adoptSession]
  );

  // The credential record is written in main, by the handler that ran
  // the replay — there is nothing to persist here. An IPC failure is
  // reported as `unavailable` rather than thrown, so the login screen has
  // one shape to branch on.
  const loginWithBiometric = useCallback(async (): Promise<ThunderBiometricUnlockResult> => {
    const result = await window.thunder?.auth.biometric
      .unlock()
      .catch((): ThunderBiometricUnlockResult => ({ ok: false, failure: "unavailable" }));
    if (!result) return { ok: false, failure: "unavailable" };
    if (result.ok) adoptSession({ token: result.token, apiKey: result.apiKey });
    return result;
  }, [adoptSession]);

  const unlockApp = useCallback(async () => {
    const passed = await window.thunder?.auth.biometric.prompt().catch(() => false);
    if (passed === true) setLockArmed(false);
    return passed === true;
  }, []);

  const logout = useCallback(async () => {
    // TD-065: before the keychain is wiped, not after. Dropping the
    // server-side conversation is an authenticated request, and main
    // reads the token per request — clearing it first would leave the
    // transcript on the server with nothing able to delete it.
    clearChat();
    // TD-035: clear the embedded browser's partition (cookies / storage)
    // alongside the keychain so the next user can't see the previous
    // session's data. The webview itself resets on its own — flipping
    // isAuthenticated unmounts ProtectedDesktopOutlet → DesktopLayout →
    // BrowserPage → webview, so React state and history are dropped.
    // TD-094: the remembered password goes with the session. Leaving it
    // behind would hand the next person at the machine a sign-in.
    const results = await Promise.allSettled([
      window.thunder?.auth.clear(),
      window.thunder?.auth.biometric?.forget(),
      window.thunder?.browser?.clearSession(),
    ]);
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[useAuth] logout cleanup failed:", errorMessage(r.reason));
      }
    }
    setCachedCreds(null);
    resetClientGuards();
    clearTabHistory();
    setLockArmed(false);
    setState(EMPTY_STATE);
  }, [clearTabHistory, clearChat]);

  // Re-check token validity on window focus. If the JWT has expired, try
  // silent reauth first — and only log out (which clears the stored
  // refresh token) when the failure says the session is genuinely over.
  // TD-093: a laptop opened on a train fails the refresh with no response
  // at all; logging out there would cost the user a live 30-day session
  // and delete the only copy of its credential.
  useEffect(() => {
    const handleFocus = async () => {
      if (!state.token || isTokenValid(state.token)) return;
      try {
        const fresh = await reauthenticate();
        setState(signedInState(fresh));
      } catch (error) {
        if (isSessionEnded(error)) await logout();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [state.token, logout]);

  return React.createElement(
    AuthContext.Provider,
    {
      value: {
        ...state,
        isAuthenticated,
        isLoading,
        isLocked,
        login,
        loginWithBiometric,
        unlockApp,
        logout,
      },
    },
    children
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
