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
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isTokenValid(token: string): boolean {
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function getInitialState(): AuthState {
  const token = localStorage.getItem("userToken");
  const apiKey = localStorage.getItem("apiKey");

  if (token && isTokenValid(token)) {
    const decoded = jwtDecode<JwtPayload>(token);
    return { token, apiKey, userId: decoded.sub };
  }

  localStorage.removeItem("userToken");
  localStorage.removeItem("apiKey");
  return { token: null, apiKey: null, userId: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(getInitialState);

  const isAuthenticated = !!state.token && isTokenValid(state.token);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    const { access_token, api_key } = response.data;

    localStorage.setItem("userToken", access_token);
    localStorage.setItem("apiKey", api_key);

    const decoded = jwtDecode<JwtPayload>(access_token);
    setState({ token: access_token, apiKey: api_key, userId: decoded.sub });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("userToken");
    localStorage.removeItem("apiKey");
    setState({ token: null, apiKey: null, userId: null });
    // Best-effort: clear cached images so they don't leak across login sessions.
    // Fire-and-forget — logout stays synchronous and is not blocked by IndexedDB.
    void clearImageCache().catch(() => {});
  }, []);

  // Re-check token validity on window focus
  useEffect(() => {
    const handleFocus = () => {
      if (state.token && !isTokenValid(state.token)) {
        logout();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [state.token, logout]);

  return React.createElement(
    AuthContext.Provider,
    { value: { ...state, isAuthenticated, login, logout } },
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
