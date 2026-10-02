/**
 * TD-093: silent reauth using the refresh token stored at login time.
 *
 * Reads the credential store via IPC, POSTs `v1/refresh` with the stored
 * refresh token, writes the fresh access token back — alongside the *same*
 * refresh token — and updates the in-memory cache so the next request uses
 * it.
 *
 * Supersedes TD-030, which replayed the user's email and password instead.
 * HALO-269 gave Halo a refresh endpoint, so the credential this app keeps
 * on disk is now good for one 30-day session rather than for signing in
 * anywhere, forever.
 *
 * Throws an `Error` with `name = 'ReauthUnavailable'` when the record
 * carries no refresh token — the caller treats that as a session that is
 * over. Every other failure is classified by {@link isSessionEnded}: a
 * busy Cognito or a dropped connection must not cost the user a session
 * whose only copy is the record we would delete.
 */

import axios from "axios";
import { API_URL } from "../config/env";
import { setCachedCreds } from "./client";
import type { LoginResponse, RefreshResponse } from "../types";

export interface FreshCreds {
  token: string;
  apiKey: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * Persist the access token both exchanges mint, alongside the credential
 * that is to stay at rest, and prime the in-memory cache so the next
 * request carries it.
 */
async function persist(
  fresh: FreshCreds,
  email: string | undefined,
  refreshToken: string
): Promise<FreshCreds> {
  await window.thunder.auth.set({
    token: fresh.token,
    apiKey: fresh.apiKey,
    email,
    refreshToken,
  });
  setCachedCreds(fresh);
  return fresh;
}

/**
 * Whether a reauth failure means the Halo session is genuinely over, and
 * the stored record should be cleared.
 *
 * HALO-269 §3 answers a refresh with 401 when the token is expired,
 * revoked or minted for another client, and 400 when the body is missing
 * the token — our own bug, and not retryable into working. Everything
 * else (500 for throttling and `ClientNotConfigured`, no response at all
 * for offline/DNS/timeout, a thrown TypeError from this module) is
 * transient: keep the record and let the next request try again.
 */
export function isSessionEnded(error: unknown): boolean {
  if (error instanceof Error && error.name === "ReauthUnavailable") return true;
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 400;
}

export async function reauthenticate(): Promise<FreshCreds> {
  const stored = await window.thunder?.auth.get();
  if (!stored?.refreshToken) {
    const err = new Error("No stored refresh token for silent reauth.");
    err.name = "ReauthUnavailable";
    throw err;
  }

  const response = await axios.post<RefreshResponse>(
    `${API_URL}v1/refresh`,
    { refresh_token: stored.refreshToken },
    { headers: JSON_HEADERS }
  );

  const { access_token, api_key } = response.data.data;
  // The refresh token written back is the one we were handed. HALO-269
  // has rotation off, so `/v1/refresh` returns no `refresh_token` at all
  // — writing the response's absent key over the stored one would log the
  // user out an hour later with nothing in any log to explain it.
  return persist(
    { token: access_token, apiKey: api_key },
    stored.email,
    stored.refreshToken
  );
}

/**
 * TD-093 migration: one last `v1/login` with the password a pre-TD-093
 * install left on disk, trading it for a refresh token. The record it
 * writes carries no password, so this runs exactly once per install and
 * the password path then does not exist at all.
 *
 * Throws on any failure — the boot check treats a failed migration as a
 * re-login rather than a reason to keep the password another cycle.
 */
export async function migratePasswordToRefreshToken(
  email: string,
  password: string
): Promise<FreshCreds> {
  const response = await axios.post<LoginResponse>(
    `${API_URL}v1/login`,
    { email, password },
    { headers: JSON_HEADERS }
  );

  const { access_token, api_key, refresh_token } = response.data.data;
  return persist({ token: access_token, apiKey: api_key }, email, refresh_token);
}
