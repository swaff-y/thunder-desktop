/**
 * TD-094: the Touch ID section. Arming a lock this machine cannot open is
 * the failure worth preventing, so the prompt comes before the write —
 * and turning a lock off is never gated behind anything.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThunderBiometricStatus } from "../../../../../preload/thunder-api";

const invalidateQueries = vi.fn(async () => {});
let status: ThunderBiometricStatus = { supported: true, remembered: true };

vi.mock("../../../api/cache", () => ({
  queryClient: { invalidateQueries },
}));

vi.mock("../../../hooks/useBiometric", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../hooks/useBiometric")>()),
  useBiometricStatus: () => status,
}));

const SettingsModal = (await import("../SettingsModal")).default;

const SETTINGS = {
  apiUrl: "https://halo.example/",
  downloadFolder: "/tmp/Thunder",
  contextUrl: "https://ctx.example/v1",
  chatEnabled: false,
  requireTouchIdOnLaunch: false,
};

let settingsSet: ReturnType<typeof vi.fn>;
let prompt: ReturnType<typeof vi.fn>;
let forget: ReturnType<typeof vi.fn>;

async function open(settings = SETTINGS): Promise<void> {
  window.thunder = {
    settings: {
      getAll: vi.fn(async () => settings),
      set: settingsSet,
    },
    auth: { biometric: { prompt, forget, status: vi.fn() } },
  } as unknown as typeof window.thunder;
  render(<SettingsModal show onHide={vi.fn()} />);
  await waitFor(() => expect(screen.getByDisplayValue(settings.apiUrl)).toBeInTheDocument());
}

const toggle = (): HTMLElement => screen.getByLabelText("Require Touch ID on launch");
function save(): void {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => {
  status = { supported: true, remembered: true };
  invalidateQueries.mockReset().mockResolvedValue(undefined);
  settingsSet = vi.fn(async () => {});
  prompt = vi.fn(async () => true);
  forget = vi.fn(async () => {});
});

describe("the launch-gate toggle", () => {
  it("is not rendered where Touch ID is unavailable", async () => {
    status = { supported: false, remembered: false, reason: "sensor" };

    await open();

    expect(screen.queryByLabelText("Require Touch ID on launch")).not.toBeInTheDocument();
  });

  it("says the gate guards an unlocked laptop rather than the credential file", async () => {
    await open();

    expect(screen.getByText(/unlocked laptop/i)).toBeInTheDocument();
    expect(screen.getByText(/does not protect the credential file/i)).toBeInTheDocument();
  });

  it("prompts before arming, and persists once the prompt passes", async () => {
    await open();

    fireEvent.click(toggle());

    await waitFor(() => expect(toggle()).toBeChecked());
    expect(prompt).toHaveBeenCalledTimes(1);

    save();
    await waitFor(() =>
      expect(settingsSet).toHaveBeenCalledWith("requireTouchIdOnLaunch", true)
    );
  });

  it("writes nothing when the prompt is dismissed", async () => {
    prompt.mockResolvedValue(false);
    await open();

    fireEvent.click(toggle());

    await waitFor(() => expect(prompt).toHaveBeenCalled());
    expect(toggle()).not.toBeChecked();

    // Edit an unrelated field so the save definitely writes something —
    // otherwise "wrote nothing" would pass on an inert save.
    fireEvent.change(screen.getByDisplayValue(SETTINGS.apiUrl), {
      target: { value: "https://halo-other.example/" },
    });
    save();
    await waitFor(() => expect(settingsSet).toHaveBeenCalledWith("apiUrl", expect.any(String)));
    expect(settingsSet).not.toHaveBeenCalledWith("requireTouchIdOnLaunch", expect.anything());
  });

  it("disarms with no prompt at all", async () => {
    await open({ ...SETTINGS, requireTouchIdOnLaunch: true });

    fireEvent.click(toggle());

    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(prompt).not.toHaveBeenCalled();

    save();
    await waitFor(() =>
      expect(settingsSet).toHaveBeenCalledWith("requireTouchIdOnLaunch", false)
    );
  });
});

describe("forgetting the remembered password", () => {
  it("is offered only when one is remembered", async () => {
    status = { supported: true, remembered: false };

    await open();

    expect(
      screen.queryByRole("button", { name: "Forget my remembered password" })
    ).not.toBeInTheDocument();
  });

  it("deletes it and re-reads the status", async () => {
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Forget my remembered password" }));

    await waitFor(() => expect(forget).toHaveBeenCalledTimes(1));
    expect(invalidateQueries).toHaveBeenCalled();
  });
});
