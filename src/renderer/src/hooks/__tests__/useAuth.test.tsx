/**
 * TD-093: the boot check's branch wiring. Every existing TD-030 install
 * traverses the migration branch exactly once, so which branch fires for
 * which record shape is the part worth pinning down — the exchanges
 * themselves are covered in `api/__tests__/reauth.test.ts`.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
// TD-094: the launch gate's three conditions, each independently
// breakable so the fail-open behaviour can be pinned one at a time.
let launchSetting: unknown = false;
let biometricSupported = true;
let settingsGet: ReturnType<typeof vi.fn>;
let biometricStatus: ReturnType<typeof vi.fn>;
let biometricPrompt: ReturnType<typeof vi.fn>;
let biometricForget: ReturnType<typeof vi.fn>;

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
  launchSetting = false;
  biometricSupported = true;
  settingsGet = vi.fn(async () => launchSetting);
  biometricStatus = vi.fn(async () => ({
    supported: biometricSupported,
    remembered: false,
  }));
  biometricPrompt = vi.fn(async () => true);
  biometricForget = vi.fn(async () => {});
  window.thunder = {
    auth: {
      get: vi.fn(async () => (stored ? { ...stored } : null)),
      set: vi.fn(async () => {}),
      clear,
      biometric: {
        status: biometricStatus,
        prompt: biometricPrompt,
        forget: biometricForget,
        remember: vi.fn(async () => true),
        unlock: vi.fn(),
      },
    },
    settings: { get: settingsGet },
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

describe("launch gate (TD-094)", () => {
  function LockProbe() {
    const { isLocked, isLoading, unlockApp } = useAuth();
    if (isLoading) return <p>loading</p>;
    return (
      <>
        <p>{isLocked ? "locked" : "unlocked"}</p>
        <button onClick={() => void unlockApp()}>unlock</button>
      </>
    );
  }

  async function bootLocked(): Promise<void> {
    render(
      <AuthProvider>
        <LockProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.queryByText("loading")).not.toBeInTheDocument());
  }

  beforeEach(() => {
    stored = { token: VALID, apiKey: "k", email: "kyle@example.com", refreshToken: "refresh-1" };
    launchSetting = true;
  });

  it("arms when the setting is on, Touch ID is available and a session is stored", async () => {
    await bootLocked();

    expect(screen.getByText("locked")).toBeInTheDocument();
  });

  it("stays open with the setting off", async () => {
    launchSetting = false;

    await bootLocked();

    expect(screen.getByText("unlocked")).toBeInTheDocument();
  });

  it("stays open on a value that is not a literal true", async () => {
    launchSetting = "yes";

    await bootLocked();

    expect(screen.getByText("unlocked")).toBeInTheDocument();
  });

  it("stays open where Touch ID is unavailable", async () => {
    biometricSupported = false;

    await bootLocked();

    expect(screen.getByText("unlocked")).toBeInTheDocument();
  });

  it("stays open when no session is stored, without probing at all", async () => {
    stored = null;

    await bootLocked();

    expect(screen.getByText("unlocked")).toBeInTheDocument();
    expect(settingsGet).not.toHaveBeenCalled();
    expect(biometricStatus).not.toHaveBeenCalled();
  });

  it("stays open when the settings read fails", async () => {
    settingsGet.mockRejectedValue(new Error("IPC unavailable"));

    await bootLocked();

    expect(screen.getByText("unlocked")).toBeInTheDocument();
  });

  it("stays open when the support probe fails", async () => {
    biometricStatus.mockRejectedValue(new Error("IPC unavailable"));

    await bootLocked();

    expect(screen.getByText("unlocked")).toBeInTheDocument();
  });

  it("stays open when the stored session turns out to be over", async () => {
    stored = { token: EXPIRED, apiKey: "k", email: "kyle@example.com", refreshToken: "refresh-1" };
    reauth.mockRejectedValue(statusFailure(401));

    await bootLocked();

    // There is nothing left to unlock — the user needs the form.
    expect(screen.getByText("unlocked")).toBeInTheDocument();
  });

  it("lifts on a passed prompt", async () => {
    await bootLocked();

    fireEvent.click(screen.getByRole("button", { name: "unlock" }));

    await waitFor(() => expect(screen.getByText("unlocked")).toBeInTheDocument());
  });

  it("stays armed on a dismissed prompt, clearing nothing", async () => {
    biometricPrompt.mockResolvedValue(false);

    await bootLocked();
    fireEvent.click(screen.getByRole("button", { name: "unlock" }));

    await waitFor(() => expect(biometricPrompt).toHaveBeenCalled());
    expect(screen.getByText("locked")).toBeInTheDocument();
    expect(clear).not.toHaveBeenCalled();
  });
});

describe("logout (TD-094)", () => {
  function LogoutProbe() {
    const { isAuthenticated, isLoading, logout } = useAuth();
    if (isLoading) return <p>loading</p>;
    return (
      <>
        <p>{isAuthenticated ? "signed in" : "signed out"}</p>
        <button onClick={() => void logout()}>sign out</button>
      </>
    );
  }

  it("forgets the remembered password alongside the session", async () => {
    stored = { token: VALID, apiKey: "k", email: "kyle@example.com", refreshToken: "refresh-1" };
    render(
      <AuthProvider>
        <LogoutProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("signed in")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "sign out" }));

    await waitFor(() => expect(screen.getByText("signed out")).toBeInTheDocument());
    // A password left behind is a sign-in for the next person at the machine.
    expect(biometricForget).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
