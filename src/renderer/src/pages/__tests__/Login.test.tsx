/**
 * TD-094: the login screen's two Touch ID affordances. The assertion that
 * matters on the opt-in is that it cannot fail the sign-in it rides on;
 * on the unlock, that each failure says the right thing and only a
 * refused password takes the button away.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThunderBiometricStatus } from "../../../../preload/thunder-api";

const login = vi.fn(async () => {});
const loginWithBiometric = vi.fn();
const navigate = vi.fn();
const invalidateQueries = vi.fn(async () => {});
let status: ThunderBiometricStatus = { supported: true, remembered: false };

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ login, loginWithBiometric }),
}));

vi.mock("../../hooks/useBiometric", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks/useBiometric")>()),
  useBiometricStatus: () => status,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../../api/cache", () => ({
  queryClient: { invalidateQueries },
}));

const Login = (await import("../Login")).default;

let remember: ReturnType<typeof vi.fn>;

beforeEach(() => {
  status = { supported: true, remembered: false };
  login.mockReset().mockResolvedValue(undefined);
  loginWithBiometric.mockReset();
  navigate.mockReset();
  invalidateQueries.mockReset().mockResolvedValue(undefined);
  remember = vi.fn(async () => true);
  window.thunder = {
    auth: { biometric: { remember } },
  } as unknown as typeof window.thunder;
});

/** Fills the form and submits it, optionally checking the opt-in first. */
async function signIn(options: { optIn?: boolean } = {}): Promise<void> {
  fireEvent.change(screen.getByPlaceholderText("Email"), {
    target: { value: "kyle@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("Password"), {
    target: { value: "hunter2" },
  });
  if (options.optIn) {
    fireEvent.click(screen.getByLabelText("Remember my password for Touch ID"));
  }
  fireEvent.click(screen.getByRole("button", { name: "Login" }));
  await waitFor(() => expect(login).toHaveBeenCalled());
}

describe("the opt-in", () => {
  it("is not rendered where Touch ID is unavailable", () => {
    status = { supported: false, remembered: false, reason: "platform" };

    render(<Login />);

    expect(
      screen.queryByLabelText("Remember my password for Touch ID")
    ).not.toBeInTheDocument();
  });

  it("is unchecked by default", () => {
    render(<Login />);

    expect(screen.getByLabelText("Remember my password for Touch ID")).not.toBeChecked();
  });

  it("stores nothing when it is left unchecked", async () => {
    render(<Login />);

    await signIn();

    expect(remember).not.toHaveBeenCalled();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
  });

  it("hands main the login to remember", async () => {
    render(<Login />);

    await signIn({ optIn: true });

    await waitFor(() =>
      expect(remember).toHaveBeenCalledWith({
        email: "kyle@example.com",
        password: "hunter2",
      })
    );
  });

  it("leaves the user signed in and navigated when the store fails", async () => {
    remember.mockRejectedValue(new Error("safeStorage unavailable"));
    render(<Login />);

    await signIn({ optIn: true });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
  });
});

describe("the unlock button", () => {
  it("is not rendered with nothing remembered", () => {
    render(<Login />);

    expect(screen.queryByRole("button", { name: "Unlock with Touch ID" })).not.toBeInTheDocument();
  });

  it("leaves the form available beneath it", () => {
    status = { supported: true, remembered: true };

    render(<Login />);

    expect(screen.getByRole("button", { name: "Unlock with Touch ID" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
  });

  it("navigates on a passed replay", async () => {
    status = { supported: true, remembered: true };
    loginWithBiometric.mockResolvedValue({ ok: true, token: "t", apiKey: "k" });

    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Unlock with Touch ID" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
  });

  it("says nothing when the prompt is dismissed", async () => {
    status = { supported: true, remembered: true };
    loginWithBiometric.mockResolvedValue({ ok: false, failure: "cancelled" });

    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Unlock with Touch ID" }));

    await waitFor(() => expect(loginWithBiometric).toHaveBeenCalled());
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("explains a refused password and drops the stored one", async () => {
    status = { supported: true, remembered: true };
    loginWithBiometric.mockResolvedValue({ ok: false, failure: "rejected" });

    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Unlock with Touch ID" }));

    expect(await screen.findByText(/your password has changed/i)).toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalled();
  });

  it("asks for a retry on a transient failure, keeping the stored password", async () => {
    status = { supported: true, remembered: true };
    loginWithBiometric.mockResolvedValue({ ok: false, failure: "transient" });

    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Unlock with Touch ID" }));

    expect(await screen.findByText(/try again in a moment/i)).toBeInTheDocument();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
