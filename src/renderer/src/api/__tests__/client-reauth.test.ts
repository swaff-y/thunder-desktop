/**
 * TD-093: the 401 interceptor's failure branch, which TD-030 could not
 * split. A refresh that comes back 401 means the session is over; a
 * refresh that comes back 500, or never comes back at all, means Cognito
 * was busy or the wifi dropped — and the record the old code deleted is
 * the only copy of a 30-day credential.
 *
 * Only the transport is faked here: the interceptor, `reauthenticate` and
 * `isSessionEnded` all run for real, because the split under test is the
 * seam between them.
 */

import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { ThunderStoredAuthCredentials } from "../../../../preload/thunder-api";
import client, { resetClientGuards, setCachedCreds } from "../client";
import { statusFailure, transportFailure } from "./axios-failures";

const REFRESH_BODY = {
  statusCode: 200,
  data: { access_token: "new-access", api_key: "new-key", expires_in: 3600 },
};

/** Queued answers from the fake transport, one per outbound request. */
let plan: Array<"401" | "ok"> = [];
let requests: InternalAxiosRequestConfig[] = [];
let stored: ThunderStoredAuthCredentials | null = null;
let clear: ReturnType<typeof vi.fn>;
/** The refresh call. `axios.post`, because `reauthenticate` bypasses the client. */
let refresh: MockInstance<typeof axios.post>;

beforeEach(() => {
  plan = [];
  requests = [];
  stored = {
    token: "expired-access",
    apiKey: "old-key",
    email: "kyle@example.com",
    refreshToken: "refresh-1",
  };
  clear = vi.fn(async () => {
    stored = null;
  });
  window.thunder = {
    auth: {
      get: vi.fn(async () => (stored ? { ...stored } : null)),
      set: vi.fn(async () => {}),
      clear,
    },
  } as unknown as typeof window.thunder;
  refresh = vi.spyOn(axios, "post");
  window.location.hash = "#/records";
  setCachedCreds({ token: "expired-access", apiKey: "old-key" });
  resetClientGuards();
  client.defaults.adapter = async (config) => {
    requests.push(config);
    if (plan.shift() === "401") throw statusFailure(401, config);
    return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete client.defaults.adapter;
});

describe("401 interceptor", () => {
  it("retries the request with the freshly minted token", async () => {
    plan = ["401", "ok"];
    refresh.mockResolvedValue({ data: REFRESH_BODY });

    await expect(client.get("/records")).resolves.toMatchObject({ status: 200 });

    expect(requests).toHaveLength(2);
    expect(requests[1].headers["Authorization"]).toBe("Bearer new-access");
    expect(requests[1].headers["x-api-key"]).toBe("new-key");
    expect(clear).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/records");
  });

  it("clears and redirects once when the refresh token is revoked", async () => {
    plan = ["401"];
    refresh.mockRejectedValue(statusFailure(401));

    await expect(client.get("/records")).rejects.toBeInstanceOf(AxiosError);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/login");

    // A second failing request while the redirect is in flight must not
    // clear again or loop.
    plan = ["401"];
    await expect(client.get("/records")).rejects.toBeInstanceOf(AxiosError);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("clears when the refresh body was malformed (400)", async () => {
    plan = ["401"];
    refresh.mockRejectedValue(statusFailure(400));

    await expect(client.get("/records")).rejects.toBeInstanceOf(AxiosError);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/login");
  });

  it("clears when there is no stored refresh token to refresh with", async () => {
    plan = ["401"];
    stored = { token: "expired-access", apiKey: "old-key", email: "kyle@example.com" };

    await expect(client.get("/records")).rejects.toBeInstanceOf(AxiosError);

    expect(refresh).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/login");
  });

  it("keeps the user signed in when the refresh answers 500", async () => {
    plan = ["401"];
    refresh.mockRejectedValue(statusFailure(500));

    await expect(client.get("/records")).rejects.toBeInstanceOf(AxiosError);

    expect(clear).not.toHaveBeenCalled();
    expect(stored?.refreshToken).toBe("refresh-1");
    expect(window.location.hash).toBe("#/records");
  });

  it("keeps the user signed in when the refresh never gets an answer", async () => {
    plan = ["401"];
    refresh.mockRejectedValue(transportFailure());

    await expect(client.get("/records")).rejects.toBeInstanceOf(AxiosError);

    expect(clear).not.toHaveBeenCalled();
    expect(stored?.refreshToken).toBe("refresh-1");
    expect(window.location.hash).toBe("#/records");
  });

  it("succeeds on a later request once the backend is reachable again", async () => {
    plan = ["401"];
    refresh.mockRejectedValueOnce(transportFailure());
    await expect(client.get("/records")).rejects.toBeInstanceOf(AxiosError);

    plan = ["401", "ok"];
    refresh.mockResolvedValue({ data: REFRESH_BODY });
    await expect(client.get("/records")).resolves.toMatchObject({ status: 200 });

    expect(clear).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/records");
  });

  it("gives up when the freshly minted token is rejected too", async () => {
    plan = ["401", "401"];
    refresh.mockResolvedValue({ data: REFRESH_BODY });

    await expect(client.get("/records")).rejects.toBeInstanceOf(AxiosError);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/login");
  });

  it("leaves a non-401 failure entirely alone", async () => {
    client.defaults.adapter = async (config) => {
      requests.push(config);
      throw statusFailure(500, config);
    };

    await expect(client.get("/records")).rejects.toBeInstanceOf(AxiosError);

    expect(refresh).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/records");
  });
});
