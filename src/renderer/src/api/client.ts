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

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && !isRedirectingToLogin) {
      try {
        const fresh = await ensureReauth();
        const config = error.config;
        if (config) {
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
