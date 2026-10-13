/**
 * TD-094: the launch gate's screen, and the one structural guarantee that
 * matters — nothing mounts behind it. A lock with the app rendered (and
 * querying, and running an embedded webview) underneath is decoration.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const unlockApp = vi.fn(async () => true);
const logout = vi.fn(async () => {});
let isLocked = true;

vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({ isLocked, unlockApp, logout }),
}));

const { LaunchGate } = await import("../../../App");
const LaunchLock = (await import("../LaunchLock")).default;

beforeEach(() => {
  isLocked = true;
  unlockApp.mockReset().mockResolvedValue(true);
  logout.mockReset().mockResolvedValue(undefined);
});

describe("LaunchGate", () => {
  it("renders the lock in place of its children", () => {
    render(
      <LaunchGate>
        <p>the app</p>
      </LaunchGate>
    );

    expect(screen.getByRole("button", { name: "Unlock with Touch ID" })).toBeInTheDocument();
    expect(screen.queryByText("the app")).not.toBeInTheDocument();
  });

  it("renders its children once unlocked", () => {
    isLocked = false;

    render(
      <LaunchGate>
        <p>the app</p>
      </LaunchGate>
    );

    expect(screen.getByText("the app")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unlock with Touch ID" })).not.toBeInTheDocument();
  });
});

describe("LaunchLock", () => {
  it("says the gate guards an unlocked laptop rather than the stored session", () => {
    render(<LaunchLock />);

    expect(screen.getByText(/unlocked laptop/i)).toBeInTheDocument();
    expect(screen.getByText(/does not protect the stored/i)).toBeInTheDocument();
  });

  it("offers a retry after a dismissed prompt", async () => {
    unlockApp.mockResolvedValue(false);
    render(<LaunchLock />);

    fireEvent.click(screen.getByRole("button", { name: "Unlock with Touch ID" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/try again/i);
    expect(logout).not.toHaveBeenCalled();
  });

  it("says nothing about a retry before the first attempt", () => {
    render(<LaunchLock />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers signing out as the escape hatch", async () => {
    render(<LaunchLock />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out instead" }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
