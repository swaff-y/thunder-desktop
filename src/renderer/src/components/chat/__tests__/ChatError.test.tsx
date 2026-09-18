import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatError from "../ChatError";
import { reauthenticate } from "../../../api/auth";
import { OPEN_SETTINGS_EVENT } from "../../desktop/SettingsModal";
import type { ChatError as ChatErrorKind } from "@swaff-y/thunder-chat-core";

vi.mock("../../../api/auth", () => ({
  reauthenticate: vi.fn(async () => ({ token: "t", apiKey: "k" })),
}));

const RETRYABLE: Array<[ChatErrorKind, string]> = [
  ["unauthorized", "Your session expired."],
  ["unreachable", "Couldn't reach the catalogue service."],
  ["rate_limited", "Too many questions at once."],
  ["busy", "Still finishing your last question."],
  ["interrupted", "That question was interrupted."],
];

describe("ChatError", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it.each(RETRYABLE)("renders %s copy with a Retry", (error, copy) => {
    render(<ChatError error={error} onRetry={vi.fn()} />);

    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("offers Open Settings rather than a Retry when the region lacks model access", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpenSettings);
    render(<ChatError error="bedrock_access_denied" onRetry={vi.fn()} />);

    expect(screen.getByText("Claude isn't enabled for this AWS region.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Settings" }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_SETTINGS_EVENT, onOpenSettings);
  });

  it("renders the failure's own message for the kinds that carry no fixed copy", () => {
    render(<ChatError error="refusal" message="I can't help with that." onRetry={vi.fn()} />);

    expect(screen.getByText("I can't help with that.")).toBeInTheDocument();
  });

  it("keeps the server's sentence off the screen when the previous question is still running", () => {
    render(
      <ChatError
        error="busy"
        message="A turn is already in flight for this conversation."
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Still finishing your last question.")).toBeInTheDocument();
    expect(
      screen.queryByText("A turn is already in flight for this conversation."),
    ).not.toBeInTheDocument();
  });

  it("re-asks without minting a token when the previous question is still running", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ChatError error="busy" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reauthenticate)).not.toHaveBeenCalled();
  });

  it("falls back to fixed copy when the failure carried no message", () => {
    render(<ChatError error="unknown" onRetry={vi.fn()} />);

    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("stays quiet with no retry when the turn was stopped", () => {
    render(<ChatError error="cancelled" onRetry={vi.fn()} />);

    expect(screen.getByText("Stopped.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
