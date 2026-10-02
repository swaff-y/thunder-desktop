/**
 * TD-093: the refresh exchange. What matters is that the credential at
 * rest survives it — `/v1/refresh` returns no `refresh_token` (rotation is
 * off in HALO-269), so a write-back that trusted the response would blank
 * the stored token and end the session an hour later.
 */

import axios, { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ThunderAuthCredentials,
  ThunderStoredAuthCredentials,
} from "../../../../preload/thunder-api";
import { isSessionEnded, migratePasswordToRefreshToken, reauthenticate } from "../auth";
import { getCachedCreds, setCachedCreds } from "../client";
import { statusFailure, transportFailure } from "./axios-failures";

const REFRESH_BODY = {
  statusCode: 200,
  data: { access_token: "new-access", api_key: "new-key", expires_in: 3600 },
};

const LOGIN_BODY = {
  statusCode: 200,
  data: {
    access_token: "migrated-access",
    api_key: "migrated-key",
    refresh_token: "minted-refresh",
    expires_in: 3600,
  },
};

let stored: ThunderStoredAuthCredentials | null = null;
let set: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stored = {
    token: "expired-access",
    apiKey: "old-key",
    email: "kyle@example.com",
    refreshToken: "refresh-1",
  };
  // Stands in for the main-process handler, which cannot persist a
  // password whatever it is handed.
  set = vi.fn(async (creds: ThunderAuthCredentials) => {
    stored = { ...creds };
  });
  window.thunder = {
    auth: {
      get: vi.fn(async () => (stored ? { ...stored } : null)),
      set,
      clear: vi.fn(async () => {
        stored = null;
      }),
    },
  } as unknown as typeof window.thunder;
  setCachedCreds(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reauthenticate", () => {
  it("mints a token through v1/refresh, with no v1/login on the wire", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: REFRESH_BODY });

    await expect(reauthenticate()).resolves.toEqual({
      token: "new-access",
      apiKey: "new-key",
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0];
    expect(url).toMatch(/v1\/refresh$/);
    expect(body).toEqual({ refresh_token: "refresh-1" });
  });

  it("writes back the refresh token it was handed, not the response's", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: REFRESH_BODY });

    await reauthenticate();

    expect(set).toHaveBeenCalledWith({
      token: "new-access",
      apiKey: "new-key",
      email: "kyle@example.com",
      refreshToken: "refresh-1",
    });
    expect(stored?.refreshToken).toBe("refresh-1");
  });

  it("can refresh a second time with the same stored token", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: REFRESH_BODY });

    await reauthenticate();
    await expect(reauthenticate()).resolves.toEqual({
      token: "new-access",
      apiKey: "new-key",
    });
    expect(stored?.refreshToken).toBe("refresh-1");
  });

  it("updates the in-memory cache so the next request carries the new token", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: REFRESH_BODY });

    await reauthenticate();

    expect(getCachedCreds()).toEqual({ token: "new-access", apiKey: "new-key" });
  });

  it("throws ReauthUnavailable when the record carries no refresh token", async () => {
    stored = { token: "expired-access", apiKey: "old-key", email: "kyle@example.com" };
    const post = vi.spyOn(axios, "post");

    await expect(reauthenticate()).rejects.toMatchObject({ name: "ReauthUnavailable" });
    expect(post).not.toHaveBeenCalled();
  });

  it("leaves the stored record alone when the refresh fails", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(statusFailure(500));

    await expect(reauthenticate()).rejects.toBeInstanceOf(AxiosError);
    expect(stored?.refreshToken).toBe("refresh-1");
    expect(set).not.toHaveBeenCalled();
  });
});

describe("isSessionEnded", () => {
  it("is true for a revoked or expired refresh token", () => {
    expect(isSessionEnded(statusFailure(401))).toBe(true);
  });

  it("is true for a malformed refresh body, which cannot be retried into working", () => {
    expect(isSessionEnded(statusFailure(400))).toBe(true);
  });

  it("is true when there was no refresh token to send", () => {
    const err = new Error("No stored refresh token for silent reauth.");
    err.name = "ReauthUnavailable";
    expect(isSessionEnded(err)).toBe(true);
  });

  it("is false for a throttled or misconfigured Cognito", () => {
    expect(isSessionEnded(statusFailure(500))).toBe(false);
  });

  it("is false when the request never got an answer", () => {
    expect(isSessionEnded(transportFailure())).toBe(false);
  });

  it("is false for anything else, so our own bugs don't log the user out", () => {
    expect(isSessionEnded(new TypeError("stored is not an object"))).toBe(false);
  });
});

describe("migratePasswordToRefreshToken", () => {
  beforeEach(() => {
    stored = {
      token: "expired-access",
      apiKey: "old-key",
      email: "kyle@example.com",
      password: "correct horse battery staple",
    };
  });

  it("trades the stored password for a refresh token and writes no password", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: LOGIN_BODY });

    await expect(
      migratePasswordToRefreshToken("kyle@example.com", "correct horse battery staple")
    ).resolves.toEqual({ token: "migrated-access", apiKey: "migrated-key" });

    expect(post.mock.calls[0][0]).toMatch(/v1\/login$/);
    expect(stored).toEqual({
      token: "migrated-access",
      apiKey: "migrated-key",
      email: "kyle@example.com",
      refreshToken: "minted-refresh",
    });
    expect(getCachedCreds()).toEqual({ token: "migrated-access", apiKey: "migrated-key" });
  });

  it("throws when the one login fails, leaving the caller to re-login the user", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(statusFailure(401));

    await expect(
      migratePasswordToRefreshToken("kyle@example.com", "correct horse battery staple")
    ).rejects.toBeInstanceOf(AxiosError);
    expect(set).not.toHaveBeenCalled();
  });
});
