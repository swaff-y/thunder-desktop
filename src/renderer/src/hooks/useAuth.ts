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
import { reauthenticate } from "../api/auth";
import { setCachedCreds, resetClientGuards } from "../api/client";
import { clearImageCache } from "../utils/imageCache";
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
  login: (email: string, password: string, rememberPassword?: boolean) => Promise<void>;
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

// One-shot migration: copy any pre-TD-030 localStorage tokens into the
// keychain (without password — there's nothing to recover) and wipe the
// localStorage keys so we never read them again. Returns the migrated
// creds when it ran, null otherwise.
async function migrateFromLocalStorage(): Promise<{
  token: string;
  apiKey: string;
  email: string;
} | null> {
  const token = localStorage.getItem("userToken");
  const apiKey = localStorage.getItem("apiKey");
  if (!token || !apiKey) return null;

  // Pre-030 builds didn't store email; decode `sub` as a placeholder so
  // the schema's `email: string` field is non-empty. The user will fill
  // it in on next explicit login. Without an email we can't silent-reauth
  // anyway (no password stored either), so this is purely a record.
  const email = decodeUserId(token) ?? "migrated@thunder";

  try {
    await window.thunder?.auth.set({ token, apiKey, email });
  } catch (error) {
    console.error("[useAuth] localStorage migration failed", error);
    return null;
  }
  localStorage.removeItem("userToken");
  localStorage.removeItem("apiKey");
  return { token, apiKey, email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!state.token && isTokenValid(state.token);

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

        if (creds && isTokenValid(creds.token)) {
          setCachedCreds({ token: creds.token, apiKey: creds.apiKey });
          setState({
            token: creds.token,
            apiKey: creds.apiKey,
            userId: decodeUserId(creds.token),
          });
          return;
        }

        if (creds?.email && creds?.password) {
          try {
            const fresh = await reauthenticate();
            if (cancelled) return;
            setState({
              token: fresh.token,
              apiKey: fresh.apiKey,
              userId: decodeUserId(fresh.token),
            });
            return;
          } catch {
            // expired token + bad/wrong stored password — clear so we
            // don't retry every boot, then fall through to logged-out.
            await window.thunder?.auth.clear();
          }
        } else if (creds) {
          // expired token, no stored password — clear silently.
          await window.thunder?.auth.clear();
        }

        if (!cancelled) setCachedCreds(null);
      } catch (error) {
        console.error("[useAuth] boot check failed", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string, rememberPassword = true) => {
      const response = await apiLogin(email, password);
      const { access_token, api_key } = response.data;

      await window.thunder?.auth.set({
        token: access_token,
        apiKey: api_key,
        email,
        password: rememberPassword ? password : undefined,
      });
      setCachedCreds({ token: access_token, apiKey: api_key });
      resetClientGuards();
      setState({
        token: access_token,
        apiKey: api_key,
        userId: decodeUserId(access_token),
      });
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await window.thunder?.auth.clear();
    } catch (error) {
      console.error("[useAuth] logout failed to clear credentials", error);
    }
    setCachedCreds(null);
    resetClientGuards();
    setState(EMPTY_STATE);
    void clearImageCache().catch(() => {});
  }, []);

  // Re-check token validity on window focus
  useEffect(() => {
    const handleFocus = () => {
      if (state.token && !isTokenValid(state.token)) {
        void logout();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [state.token, logout]);

  return React.createElement(
    AuthContext.Provider,
    { value: { ...state, isAuthenticated, isLoading, login, logout } },
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
