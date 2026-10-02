/**
 * TD-093: the boot check's branch wiring. Every existing TD-030 install
 * traverses the migration branch exactly once, so which branch fires for
 * which record shape is the part worth pinning down — the exchanges
 * themselves are covered in `api/__tests__/reauth.test.ts`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThunderStoredAuthCredentials } from "../../../../preload/thunder-api";
import { statusFailure, transportFailure } from "../../api/__tests__/axios-failures";
import { AuthProvider, useAuth } from "../useAuth";

vi.mock("../useTabHistory", () => ({
  useTabHistory: () => ({ clearHistory: vi.fn() }),
}));

vi.mock("@swaff-y/thunder-chat-core", () => ({
  useChatActions: () => ({ clear: vi.fn() }),
}));

vi.mock("../../api/cache", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock("../../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/auth")>()),
  reauthenticate: vi.fn(),
  migratePasswordToRefreshToken: vi.fn(),
}));

const { reauthenticate, migratePasswordToRefreshToken } = await import("../../api/auth");
const reauth = vi.mocked(reauthenticate);
const migrate = vi.mocked(migratePasswordToRefreshToken);

/** A JWT `isTokenValid` will accept or reject, depending on the offset. */
function jwt(expiresInSeconds: number): string {
  const encode = (value: object): string =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return [
    encode({ alg: "none", typ: "JWT" }),
    encode({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
    "signature",
  ].join(".");
}

const VALID = jwt(3600);
const EXPIRED = jwt(-3600);
const FRESH = { token: VALID, apiKey: "new-key" };

let stored: ThunderStoredAuthCredentials | null = null;
let clear: ReturnType<typeof vi.fn>;

function Probe() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <p>loading</p>;
  return <p>{isAuthenticated ? "signed in" : "signed out"}</p>;
}

async function boot(): Promise<void> {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.queryByText("loading")).not.toBeInTheDocument());
}

beforeEach(() => {
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
  localStorage.clear();
  reauth.mockReset();
  migrate.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("boot check — password migration (TD-093)", () => {
  beforeEach(() => {
    stored = {
      token: VALID,
      apiKey: "old-key",
      email: "kyle@example.com",
      password: "correct horse battery staple",
    };
  });

  it("trades a password record for a refresh token with no visible re-login", async () => {
    migrate.mockResolvedValue(FRESH);

    await boot();

    expect(migrate).toHaveBeenCalledWith("kyle@example.com", "correct horse battery staple");
    expect(screen.getByText("signed in")).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
  });

  it("runs even while the stored access token is still valid", async () => {
    migrate.mockResolvedValue(FRESH);

    await boot();

    // The password is the thing being deleted; waiting for the access
    // token to expire would leave it on disk for another hour.
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(reauth).not.toHaveBeenCalled();
  });

  it("clears and shows the login screen when the one login fails", async () => {
    migrate.mockRejectedValue(statusFailure(401));

    await boot();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(screen.getByText("signed out")).toBeInTheDocument();
  });

  it("clears even on a transient failure — a failed migration is a re-login", async () => {
    migrate.mockRejectedValue(transportFailure());

    await boot();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(screen.getByText("signed out")).toBeInTheDocument();
  });

  it("logs the message and nothing that could carry the password", async () => {
    migrate.mockRejectedValue(statusFailure(401));
    const error = vi.mocked(console.error);

    await boot();

    expect(error).toHaveBeenCalled();
    for (const call of error.mock.calls) {
      expect(call.every((arg) => typeof arg === "string")).toBe(true);
    }
  });

  it("leaves a record that already has a refresh token alone", async () => {
    stored = { token: VALID, apiKey: "k", email: "kyle@example.com", refreshToken: "refresh-1" };

    await boot();

    expect(migrate).not.toHaveBeenCalled();
    expect(screen.getByText("signed in")).toBeInTheDocument();
  });
});

describe("boot check — expired access token (TD-093)", () => {
  beforeEach(() => {
    stored = {
      token: EXPIRED,
      apiKey: "old-key",
      email: "kyle@example.com",
      refreshToken: "refresh-1",
    };
  });

  it("refreshes and signs the user in", async () => {
    reauth.mockResolvedValue(FRESH);

    await boot();

    expect(screen.getByText("signed in")).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears when the refresh token has been revoked", async () => {
    reauth.mockRejectedValue(statusFailure(401));

    await boot();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(screen.getByText("signed out")).toBeInTheDocument();
  });

  it("keeps the record when the backend is busy or unreachable", async () => {
    reauth.mockRejectedValue(statusFailure(500));

    await boot();

    expect(clear).not.toHaveBeenCalled();
    expect(stored?.refreshToken).toBe("refresh-1");
    expect(screen.getByText("signed out")).toBeInTheDocument();
  });

  it("keeps the record when the refresh never got an answer", async () => {
    reauth.mockRejectedValue(transportFailure());

    await boot();

    expect(clear).not.toHaveBeenCalled();
    expect(stored?.refreshToken).toBe("refresh-1");
  });

  it("clears silently when there is no refresh token to refresh with", async () => {
    stored = { token: EXPIRED, apiKey: "old-key", email: "kyle@example.com" };

    await boot();

    expect(reauth).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(screen.getByText("signed out")).toBeInTheDocument();
  });
});
