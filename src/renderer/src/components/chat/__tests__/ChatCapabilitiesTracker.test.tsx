/**
 * TD-092: the greeting is drawn by `ChatPanel`, but on a launch that starts
 * logged out it never arrives to draw — the store's mount fetch is refused
 * before any token exists. These tests are about the telling, not the drawing:
 * `loadCapabilities` answers `null` while unauthenticated and a body once a
 * token is there, which is what a 401 then a 200 looks like from here.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ChatProvider, useChat, type Capabilities } from "@swaff-y/thunder-chat-core";
import ChatCapabilitiesTracker from "../ChatCapabilitiesTracker";

let isAuthenticated = false;

vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated }),
}));

const GREETING = {
  text: "Ask me about the catalogue.",
  suggestions: ["What is popular this week?"],
};

const CAPABILITIES: Capabilities = { chat_enabled: true, tools: [], greeting: GREETING };

/** The greeting as the panel would read it, without the rest of the panel. */
function GreetingProbe(): React.JSX.Element {
  const { greeting } = useChat();
  return <p data-testid="greeting">{greeting?.text ?? ""}</p>;
}

function probe(): HTMLElement {
  return screen.getByTestId("greeting");
}

function renderTracker(loadCapabilities: () => Promise<Capabilities | null>) {
  return render(
    <ChatProvider loadCapabilities={loadCapabilities} storage={sessionStorage}>
      <ChatCapabilitiesTracker />
      <GreetingProbe />
    </ChatProvider>
  );
}

describe("ChatCapabilitiesTracker", () => {
  beforeEach(() => {
    sessionStorage.clear();
    isAuthenticated = false;
  });

  it("fills the greeting the store gave up on once a token arrives", async () => {
    const loadCapabilities = vi.fn(async () => (isAuthenticated ? CAPABILITIES : null));
    const { rerender } = renderTracker(loadCapabilities);

    // TCC-017's bounded retry runs out while there is still no token, which
    // is the state a login-without-restart starts the chat in.
    await waitFor(() => expect(loadCapabilities).toHaveBeenCalledTimes(3), { timeout: 3000 });
    expect(probe()).toBeEmptyDOMElement();

    isAuthenticated = true;
    rerender(
      <ChatProvider loadCapabilities={loadCapabilities} storage={sessionStorage}>
        <ChatCapabilitiesTracker />
        <GreetingProbe />
      </ChatProvider>
    );

    await waitFor(() => expect(probe()).toHaveTextContent(GREETING.text));
  });

  it("leaves a greeting that already arrived alone", async () => {
    isAuthenticated = true;
    const loadCapabilities = vi.fn(async () => CAPABILITIES);
    renderTracker(loadCapabilities);

    await waitFor(() => expect(probe()).toHaveTextContent(GREETING.text));
    expect(loadCapabilities).toHaveBeenCalledTimes(1);
  });

  it("says nothing when the refresh cannot reach the server either", async () => {
    isAuthenticated = true;
    const loadCapabilities = vi.fn(async () => null);
    renderTracker(loadCapabilities);

    await waitFor(() => expect(loadCapabilities).toHaveBeenCalledTimes(3), { timeout: 3000 });
    expect(probe()).toBeEmptyDOMElement();
  });
});
