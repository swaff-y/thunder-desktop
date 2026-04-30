/**
 * TD-030: silent reauth using the password stored at login time.
 *
 * Reads the credential store via IPC, re-POSTs `v1/login` with the stored
 * email + password, writes the fresh token back, and updates the in-memory
 * cache so the next request uses it.
 *
 * Throws an `Error` with `name = 'ReauthUnavailable'` when no stored
 * email/password exists — the caller (`client.ts` 401 interceptor)
 * falls back to redirecting to /login.
 */

import axios from "axios";
import { API_URL } from "../config/env";
import { setCachedCreds } from "./client";
import type { LoginResponse } from "../types";

interface FreshCreds {
  token: string;
  apiKey: string;
}

export async function reauthenticate(): Promise<FreshCreds> {
  const stored = await window.thunder?.auth.get();
  if (!stored?.email || !stored?.password) {
    const err = new Error("No stored email/password for silent reauth.");
    err.name = "ReauthUnavailable";
    throw err;
  }

  const response = await axios.post<LoginResponse>(
    `${API_URL}v1/login`,
    { email: stored.email, password: stored.password },
    { headers: { "Content-Type": "application/json" } }
  );

  const { access_token, api_key } = response.data.data;
  await window.thunder.auth.set({
    token: access_token,
    apiKey: api_key,
    email: stored.email,
    password: stored.password,
  });
  setCachedCreds({ token: access_token, apiKey: api_key });
  return { token: access_token, apiKey: api_key };
}
