/**
 * TD-070: the route map, and the wiring that reads it once per question.
 *
 * The map is a pure function, so most of this file needs no React at all.
 * The rest reproduces `App.tsx`'s arrangement — a source owned above the
 * router, a tracker leaf below it — because the bug this feature is prone
 * to is a view read at the wrong moment, not a view mapped wrongly.
 */

import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import {
  ChatProvider,
  useChat,
  useChatActions,
  type ChatAskResult,
  type ChatSend,
  type ViewContext
} from "@swaff-y/thunder-chat-core";
import {
  createViewSource,
  useViewTracking,
  viewForPath,
  type TrackedViewSource
} from "../current-view";
import { answer, deferredAnswer } from "./fixtures";

describe("viewForPath", () => {
  it("maps a watch route to the record on screen", () => {
    expect(viewForPath("/watch/1234")).toEqual({ kind: "record", id: "1234" });
  });

  it("maps a category detail route to halo's singular type, not the route segment", () => {
    expect(viewForPath("/actors/77")).toEqual({ kind: "entity", type: "actor", id: "77" });
    expect(viewForPath("/movies/9")).toEqual({ kind: "entity", type: "movie", id: "9" });
    expect(viewForPath("/tags/3")).toEqual({ kind: "entity", type: "tag", id: "3" });
  });

  it("keeps the type halo already spells the same way", () => {
    expect(viewForPath("/series/5")).toEqual({ kind: "entity", type: "series", id: "5" });
  });

  it("maps a category list route to a list of that type", () => {
    expect(viewForPath("/actors")).toEqual({ kind: "list", type: "actor" });
    expect(viewForPath("/tags/")).toEqual({ kind: "list", type: "tag" });
  });

  it.each(["/", "/stats", "/browser", "/multi-watch", "/login"])(
    "has nothing to say about %s",
    (pathname) => {
      expect(viewForPath(pathname)).toBeNull();
    }
  );

  it("returns null for an unknown category rather than guessing a singular", () => {
    expect(viewForPath("/franchises")).toBeNull();
    expect(viewForPath("/franchises/4")).toBeNull();
    expect(viewForPath("/images/4")).toBeNull();
  });

  it("returns null for a route that matches nothing", () => {
    expect(viewForPath("/nope/1/2")).toBeNull();
    expect(viewForPath("")).toBeNull();
  });

  it("returns null for a route whose id is missing", () => {
    expect(viewForPath("/watch")).toBeNull();
    expect(viewForPath("/watch/")).toBeNull();
  });

  it("never sets a label — the router knows the id, not the name", () => {
    expect(viewForPath("/actors/77")).not.toHaveProperty("label");
    expect(viewForPath("/watch/1234")).not.toHaveProperty("label");
  });
});

describe("createViewSource", () => {
  it("reports nothing until something has tracked a route", () => {
    expect(createViewSource().current()).toBeNull();
  });

  it("answers with whatever was tracked last", () => {
    const source = createViewSource();
    source.track({ kind: "list", type: "actor" });
    expect(source.current()).toEqual({ kind: "list", type: "actor" });
    source.track(null);
    expect(source.current()).toBeNull();
  });
});

function Tracker({ source }: { source: TrackedViewSource }): null {
  useViewTracking(source);
  return null;
}

function Controls() {
  const { turns } = useChat();
  const { ask, retry } = useChatActions();
  const navigate = useNavigate();
  const last = turns[turns.length - 1];
  return (
    <>
      <button onClick={() => void ask("who is on this?")}>ask</button>
      <button onClick={() => last && void retry(last.id)}>retry</button>
      <button onClick={() => navigate("/")}>go home</button>
      <button onClick={() => navigate("/movies/12")}>go movie</button>
      <ul>
        {turns.map((turn) => (
          <li key={turn.id}>{turn.answer ?? ""}</li>
        ))}
      </ul>
    </>
  );
}

function renderApp(send: ChatSend, initialEntry: string) {
  function Wiring() {
    // Exactly `App.tsx`: the source outlives navigation, the tracker is a
    // leaf so `useLocation` re-renders nothing but itself.
    const [viewSource] = useState(createViewSource);
    return (
      <ChatProvider send={send} viewSource={viewSource}>
        <Tracker source={viewSource} />
        <Controls />
      </ChatProvider>
    );
  }

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Wiring />
    </MemoryRouter>
  );
}

/** The fifth positional argument to `send` — the view, or nothing. */
function viewOf(
  send: { mock: { calls: unknown[][] } },
  call = 0
): ViewContext | null | undefined {
  return send.mock.calls[call]?.[4] as ViewContext | null | undefined;
}

describe("the view a question is asked from", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("sends the record when the question is asked on a record page", async () => {
    const user = userEvent.setup();
    const send = vi.fn<ChatSend>().mockResolvedValue(answer("Nick Cage"));
    renderApp(send, "/watch/1234");

    await user.click(screen.getByRole("button", { name: "ask" }));

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(viewOf(send)).toEqual({ kind: "record", id: "1234" });
  });

  it("sends the entity when the question is asked on a detail page", async () => {
    const user = userEvent.setup();
    const send = vi.fn<ChatSend>().mockResolvedValue(answer("12"));
    renderApp(send, "/actors/77");

    await user.click(screen.getByRole("button", { name: "ask" }));

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(viewOf(send)).toEqual({ kind: "entity", type: "actor", id: "77" });
  });

  it("sends no view from the login page", async () => {
    const user = userEvent.setup();
    const send = vi.fn<ChatSend>().mockResolvedValue(answer("anything"));
    renderApp(send, "/login");

    await user.click(screen.getByRole("button", { name: "ask" }));

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(viewOf(send)).toBeNull();
  });

  it("sends no view when the route matches nothing", async () => {
    const user = userEvent.setup();
    const send = vi.fn<ChatSend>().mockResolvedValue(answer("anything"));
    renderApp(send, "/franchises/4");

    await user.click(screen.getByRole("button", { name: "ask" }));

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(viewOf(send)).toBeNull();
  });

  it("keeps the view the question was asked from when the user navigates mid-turn", async () => {
    const user = userEvent.setup();
    const pending = deferredAnswer();
    const send = vi.fn<ChatSend>(() => pending.promise);
    renderApp(send, "/watch/1234");

    await user.click(screen.getByRole("button", { name: "ask" }));
    await waitFor(() => expect(send).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "go home" }));
    pending.resolve(answer("Nick Cage"));

    expect(await screen.findByText("Nick Cage")).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
    expect(viewOf(send)).toEqual({ kind: "record", id: "1234" });
  });

  it("retries with the failed turn's view, not the page the user is on now", async () => {
    const user = userEvent.setup();
    const failure: ChatAskResult = { ok: false, error: "unreachable", message: "no" };
    const send = vi
      .fn<ChatSend>()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(answer("Nick Cage"));
    renderApp(send, "/watch/1234");

    await user.click(screen.getByRole("button", { name: "ask" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "go movie" }));
    await user.click(screen.getByRole("button", { name: "retry" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(viewOf(send, 1)).toEqual({ kind: "record", id: "1234" });
  });

  it("picks up the new page for the next question", async () => {
    const user = userEvent.setup();
    const send = vi.fn<ChatSend>().mockResolvedValue(answer("ok"));
    renderApp(send, "/watch/1234");

    await user.click(screen.getByRole("button", { name: "ask" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "go movie" }));
    await user.click(screen.getByRole("button", { name: "ask" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(viewOf(send, 1)).toEqual({ kind: "entity", type: "movie", id: "12" });
  });
});
