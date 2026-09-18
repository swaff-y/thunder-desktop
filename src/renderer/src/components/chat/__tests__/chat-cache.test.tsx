/**
 * TD-086: what a settled turn invalidates, and the leaf that does it.
 *
 * The mapping is a pure function, so most of this file needs no React. The
 * rest covers the two ways the tracker gets it wrong: firing twice for one
 * turn, and firing for a transcript it was mounted with.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChatAction, ChatTurn } from "@swaff-y/thunder-chat-core";
import { invalidationsFor, WRITE_TOOLS } from "../chat-cache";
import ChatWriteTracker from "../ChatWriteTracker";

const turns: ChatTurn[] = [];

vi.mock("@swaff-y/thunder-chat-core", () => ({
  useChat: () => ({ turns }),
}));

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

function writeTurn(id: string): ChatTurn {
  return {
    id,
    question: "rename this record to Foo",
    answer: "Renamed.",
    action: action("update_record", { id: "rec-1", name: "Foo" }),
  } as ChatTurn;
}

function renderTracker(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <ChatWriteTracker />
    </QueryClientProvider>
  );
}

describe("ChatWriteTracker", () => {
  let client: QueryClient;
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    turns.length = 0;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidate = vi.spyOn(client, "invalidateQueries").mockImplementation(async () => {});
  });

  it("invalidates the turn's keys once it settles", () => {
    const { rerender } = renderTracker(client);
    expect(invalidate).not.toHaveBeenCalled();

    turns.push(writeTurn("turn-1"));
    rerender(
      <QueryClientProvider client={client}>
        <ChatWriteTracker />
      </QueryClientProvider>
    );

    expect(invalidate.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey)).toEqual([
      ["record", "rec-1"],
      ...COLLECTIONS,
    ]);
  });

  it("does not invalidate again for the same turn", () => {
    turns.push({ id: "turn-0", question: "hi", pending: true } as ChatTurn);
    const { rerender } = renderTracker(client);

    turns.splice(0, 1, writeTurn("turn-1"));
    rerender(
      <QueryClientProvider client={client}>
        <ChatWriteTracker />
      </QueryClientProvider>
    );
    const afterFirst = invalidate.mock.calls.length;

    rerender(
      <QueryClientProvider client={client}>
        <ChatWriteTracker />
      </QueryClientProvider>
    );

    expect(invalidate.mock.calls.length).toBe(afterFirst);
  });

  it("invalidates nothing for a transcript it was mounted with", () => {
    turns.push(writeTurn("turn-1"));
    renderTracker(client);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("ignores a pending or failed turn", () => {
    const { rerender } = renderTracker(client);

    turns.push({ ...writeTurn("turn-1"), pending: true } as ChatTurn);
    turns.push({ ...writeTurn("turn-2"), error: "unreachable" } as ChatTurn);
    rerender(
      <QueryClientProvider client={client}>
        <ChatWriteTracker />
      </QueryClientProvider>
    );

    expect(invalidate).not.toHaveBeenCalled();
  });
});
