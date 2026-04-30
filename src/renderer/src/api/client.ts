import axios from "axios";
import { API_URL } from "../config/env";
import { reauthenticate } from "./auth";

interface CachedCreds {
  token: string;
  apiKey: string;
}

let cached: CachedCreds | null = null;

export function setCachedCreds(creds: CachedCreds | null): void {
  cached = creds;
}

export function getCachedCreds(): CachedCreds | null {
  return cached;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cached?.token) headers.Authorization = `Bearer ${cached.token}`;
  if (cached?.apiKey) headers["x-api-key"] = cached.apiKey;
  return headers;
}

// `API_URL` is captured here at module-load time. `main.tsx` defers
// the static import of this module behind `bootstrapEnv()` (TD-018) so
// `API_URL` already reflects the persisted setting before
// `axios.create` runs. Any new entry point that imports `client.ts`
// directly (e.g. a test harness or worker) MUST either await
// `bootstrapEnv()` first or accept the default URL — otherwise the
// captured `baseURL` will silently differ from the user's setting.
const client = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

client.interceptors.request.use((config) => {
  Object.assign(config.headers, getAuthHeaders());
  return config;
});

let isRedirectingToLogin = false;
let inFlightReauth: Promise<CachedCreds> | null = null;

function ensureReauth(): Promise<CachedCreds> {
  if (!inFlightReauth) {
    inFlightReauth = reauthenticate().finally(() => {
      inFlightReauth = null;
    });
  }
  return inFlightReauth;
}

interface RetriedConfig {
  _td030Retried?: boolean;
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && !isRedirectingToLogin) {
      const config = error.config as (typeof error.config & RetriedConfig) | undefined;

      // Bail out of the reauth-retry loop if this request has already
      // been retried once with a freshly-obtained token. A second 401
      // means the new token is also being rejected — looping would mint
      // tokens forever; the user needs to re-login instead.
      if (config?._td030Retried) {
        isRedirectingToLogin = true;
        try {
          await window.thunder?.auth.clear();
        } catch {
          // ignore — IPC may be unavailable mid-shutdown
        }
        cached = null;
        window.location.hash = "#/login";
        return Promise.reject(error);
      }

      try {
        const fresh = await ensureReauth();
        if (config) {
          config._td030Retried = true;
          config.headers["Authorization"] = `Bearer ${fresh.token}`;
          config.headers["x-api-key"] = fresh.apiKey;
          return await client.request(config);
        }
      } catch {
        // fall through to redirect
      }

      isRedirectingToLogin = true;
      try {
        await window.thunder?.auth.clear();
      } catch {
        // ignore — IPC may be unavailable mid-shutdown
      }
      cached = null;
      window.location.hash = "#/login";
    }
    return Promise.reject(error);
  }
);

export function resetClientGuards(): void {
  isRedirectingToLogin = false;
  inFlightReauth = null;
}

export default client;
