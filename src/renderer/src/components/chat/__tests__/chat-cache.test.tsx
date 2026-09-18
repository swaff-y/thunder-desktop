/**
 * TD-086: what a settled turn invalidates, and the leaf that does it.
 *
 * The mapping is a pure function, so most of this file needs no React. The
 * rest covers the two ways the tracker gets it wrong: firing twice for one
 * turn, and firing for a transcript it was mounted with.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChatAction, ChatTurn } from "@swaff-y/thunder-chat-core";
import { invalidationsFor, WRITE_TOOLS } from "../chat-cache";
import ChatWriteTracker from "../ChatWriteTracker";

const turns: ChatTurn[] = [];
let redraw: (() => void) | undefined;

// `useChat` hands out a fresh `turns` array on every store update; `redraw`
// stands in for the store pushing one, so the tracker sees the same
// empty-then-hydrated timing `ChatProvider` really has.
vi.mock("@swaff-y/thunder-chat-core", async () => {
  const { useReducer } = await import("react");
  return {
    useChat: () => {
      const [, force] = useReducer((n: number) => n + 1, 0);
      redraw = force;
      return { turns: [...turns] };
    },
  };
});

const COLLECTIONS = [["records"], ["category"], ["randomRecords"], ["userRecords"]];

function action(tool: string | null, args: Record<string, unknown> = {}): ChatAction {
  return { kind: "none", tool, args, title: "", result: null } as ChatAction;
}

describe("invalidationsFor", () => {
  it("invalidates nothing for a turn with no action", () => {
    expect(invalidationsFor(undefined)).toEqual([]);
  });

  it("invalidates nothing for a tool-less action", () => {
    expect(invalidationsFor(action(null))).toEqual([]);
  });

  it("invalidates nothing for a read tool", () => {
    expect(invalidationsFor(action("search_records", { filter: "mar" }))).toEqual([]);
    expect(invalidationsFor(action("get_record", { id: "rec-1" }))).toEqual([]);
  });

  it("invalidates the record and every collection for a record write", () => {
    expect(invalidationsFor(action("update_record", { id: "rec-1", name: "Foo" }))).toEqual([
      ["record", "rec-1"],
      ...COLLECTIONS,
    ]);
    expect(invalidationsFor(action("reprocess_record", { id: "rec-1" }))).toEqual([
      ["record", "rec-1"],
      ...COLLECTIONS,
    ]);
    expect(invalidationsFor(action("request_upload_url", { id: "rec-1" }))).toEqual([
      ["record", "rec-1"],
      ...COLLECTIONS,
    ]);
  });

  it("invalidates the entity under halo-mcp's singular type for an entity write", () => {
    expect(
      invalidationsFor(action("unassociate_entity", { entity_type: "actor", id: "a-1" }))
    ).toEqual([["entity", "actor", "a-1"], ...COLLECTIONS]);
    expect(invalidationsFor(action("delete_item", { entity_type: "tag", id: "t-1" }))).toEqual([
      ["entity", "tag", "t-1"],
      ...COLLECTIONS,
    ]);
    expect(
      invalidationsFor(action("request_image_slot_upload_url", { entity_type: "actor", id: "a-1" }))
    ).toEqual([["entity", "actor", "a-1"], ...COLLECTIONS]);
  });

  it("reads a record-typed entity write as a record", () => {
    expect(invalidationsFor(action("delete_item", { entity_type: "record", id: "rec-1" }))).toEqual(
      [["record", "rec-1"], ...COLLECTIONS]
    );
  });

  it("invalidates the collections alone when the args name no id", () => {
    expect(invalidationsFor(action("create_record", { name: "Foo" }))).toEqual(COLLECTIONS);
    expect(invalidationsFor(action("create_entity", { entity_type: "tag" }))).toEqual(COLLECTIONS);
    expect(invalidationsFor(action("update_actor", { id: 7 }))).toEqual(COLLECTIONS);
  });

  it("covers every write tool", () => {
    for (const tool of WRITE_TOOLS) {
      expect(invalidationsFor(action(tool, {}))).toEqual(COLLECTIONS);
    }
  });
});

function writeTurn(id: string, patch: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id,
    question: "rename this record to Foo",
    answer: "Renamed.",
    action: action("update_record", { id: "rec-1", name: "Foo" }),
    ...patch,
  } as ChatTurn;
}

describe("ChatWriteTracker", () => {
  let client: QueryClient;
  let invalidate: ReturnType<typeof vi.spyOn>;

  function draw() {
    render(
      <QueryClientProvider client={client}>
        <ChatWriteTracker />
      </QueryClientProvider>
    );
  }

  /** `turns` is a new array on every store update, so the effect re-runs. */
  function setTurns(next: ChatTurn[]) {
    turns.length = 0;
    turns.push(...next);
    act(() => {
      redraw?.();
    });
  }

  function invalidatedKeys() {
    return invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
  }

  beforeEach(() => {
    turns.length = 0;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidate = vi.spyOn(client, "invalidateQueries").mockImplementation(async () => {});
  });

  it("invalidates the turn's keys once the turn it watched settles", () => {
    draw();
    setTurns([writeTurn("turn-1", { pending: true, answer: undefined, action: undefined })]);
    expect(invalidate).not.toHaveBeenCalled();

    setTurns([writeTurn("turn-1")]);

    expect(invalidatedKeys()).toEqual([["record", "rec-1"], ...COLLECTIONS]);
  });

  it("does not invalidate again for the same turn", () => {
    draw();
    setTurns([writeTurn("turn-1", { pending: true, answer: undefined, action: undefined })]);
    setTurns([writeTurn("turn-1")]);
    const afterSettling = invalidate.mock.calls.length;

    setTurns([writeTurn("turn-1")]);

    expect(invalidate.mock.calls.length).toBe(afterSettling);
  });

  it("invalidates nothing for a transcript restored after mount", () => {
    // `ChatProvider` starts `turns` at `[]` and hydrates `sessionStorage`
    // asynchronously, so a reload delivers settled turns through the same
    // `setTurns` a live answer uses. Nothing here ran, so nothing refetches.
    draw();

    setTurns([writeTurn("turn-1"), writeTurn("turn-2")]);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates nothing for a transcript already present at mount", () => {
    turns.push(writeTurn("turn-1"));
    draw();

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates nothing when the turn it watched fails", () => {
    draw();
    setTurns([writeTurn("turn-1", { pending: true, answer: undefined, action: undefined })]);

    setTurns([writeTurn("turn-1", { error: "unreachable", action: undefined })]);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates nothing for a read turn it watched", () => {
    draw();
    setTurns([writeTurn("turn-1", { pending: true, answer: undefined, action: undefined })]);

    setTurns([writeTurn("turn-1", { action: action("get_record", { id: "rec-1" }) })]);

    expect(invalidate).not.toHaveBeenCalled();
  });
});
