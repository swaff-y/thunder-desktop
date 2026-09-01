# TD-075 — AI chat: the upload card, with a drop zone

## Description

thunder-context [TC-028](https://github.com/swaff-y/thunder-context/blob/main/docs/tickets/TC-028-the-chat-offers-to-upload-the-image.md)
teaches the chat to offer an upload after it creates something:

```
user       add an actor called Tom Hardy
assistant  Added Tom Hardy. Would you like to upload an image for him?
user       yes
```

and the second turn comes back with a fifth action kind:

```jsonc
{ "kind": "upload",
  "target": { "entityType": "actor", "id": "f93d…", "name": "Tom Hardy" },
  "title": "Upload an image for Tom Hardy",
  "result": { "id": "f93d…", "status": "processing", … } }
```

This ticket renders it: a card with a drop zone, and the upload behind it.

**The card is handed a target, never a URL.** The server strips every presigned
`url` / `uploadUrl` at every depth, and would be handing us a dead one anyway —
a turn takes 10–60s and the URL is short-lived and single-use. The renderer
mints its own against Halo, and this is the sentence that matters most in the
ticket:

> **Minting deletes the current image before a single byte is uploaded.**
> `POST /v1/{entityType}/{id}/upload` sets `url = nil` and bumps
> `image_version` immediately. A card that mints on mount has destroyed an
> avatar for a user who was only reading.

So: mint **after** the file is dropped, never before, and confirm first when the
subject already has an image.

The sequence itself is not ours — `@swaff-y/thunder-chat-core@0.9.0` (TCC-011)
carries `toUploadCard` and `createUploadFlow`, with the HTTP injected as ports,
because all three apps need the same five steps and the one worth getting wrong
is invisible. This repo supplies the ports, the drop zone and the pixels.

Depends on: TC-028 deployed, and `@swaff-y/thunder-chat-core@0.9.0` published.

## Requirements

### 1. Bump the pin — `package.json`

`0.8.0` → `0.9.0`, exact. This repo is the one that is current, so it is a
single-version bump.

### 2. The ports — `src/renderer/src/api/halo.ts`

Three functions, beside the existing `fetchEntity` / `updateRecord` and using
the same authenticated `client`:

- `requestUploadUrl(entityType, id)` → `POST v1/{entityType}/{id}/upload` →
  `{ id, uploadUrl }`. Give it a doc comment that says what it destroys; it is
  the most dangerous function in this file and it does not look like it.
- `putUpload(uploadUrl, file, onProgress, signal)` → a bare `axios.put`, **not**
  through `client`: no `Authorization`, no `x-api-key`, no base URL. The
  presigned URL is the authorisation, and an extra signed header is a 403.
  `Content-Type: application/octet-stream`, and axios sets `Content-Length` from
  the `File` — S3 rejects chunked encoding on a presigned PUT.
- `fetchEntity` already exists and is the poll read.

`src/renderer/index.html`'s CSP is `connect-src 'self' https:`, so an S3 host is
already allowed. **No CSP change is needed** — noted here so nobody spends an
afternoon proving it.

### 3. The card — `src/renderer/src/components/chat/ActionCardUpload.tsx`

New component, dispatched from `ChatPanel.tsx`'s `TurnAction` beside the three
existing `action.kind ===` branches, above the `return null`.

Its states come straight off `UploadState` from the flow:

| phase | what the card shows |
| --- | --- |
| `idle` | the drop zone: "Drop an image here, or **choose a file**" |
| `confirming` | "Tom Hardy already has an image. Uploading replaces it — there is no undo." + Replace / Cancel |
| `minting` | a spinner, "Preparing…" |
| `uploading` | a determinate bar from `loaded`/`total` |
| `processing` | "Uploaded. Halo is processing it…" |
| `done` | the new image, and one line of confirmation |
| `failed` | the message, and **Try again** |
| `cancelled` | see below |

- The drop zone takes a real drag-and-drop (`dragover` / `drop`, with a hover
  state) **and** a `<label>`-wrapped `<input type="file" accept="image/*">`.
  Drag-and-drop alone is not reachable by keyboard.
- Accept one file. A drop of three is the first one and a line saying so, not a
  silent pick and not an error.
- `entityType === 'record'` accepts `video/*` and the copy says video. It is the
  same card; only the accept list and two words change.
- **`cancelled` must not read as "nothing happened".** A cancel after `minting`
  succeeded leaves the subject with no image, and the card says exactly that:
  "The old image was already removed. Upload one to replace it." The flow gives
  you `at` for precisely this.
- On `done`, invalidate the React Query key for that entity using the
  `imageCacheKey` the flow returns, so the card and any list behind it show the
  new picture rather than the cached old one.

### 4. Tests — `src/renderer/src/components/chat/__tests__/ActionCardUpload.test.tsx`

- Renders a drop zone for a valid `kind: 'upload'` action.
- Renders **nothing** for a target `toUploadCard` rejects (a `franchise`, an
  empty id) — the fallback path, asserted rather than assumed.
- **Mounting the card issues no request.** The regression test for the whole
  ticket: assert `requestUploadUrl` was not called until a file is supplied.
- A subject with `status: 'processed'` shows the confirm step before anything is
  minted; Cancel there issues no request either.
- A failed PUT surfaces the message and the retry button; retry calls
  `requestUploadUrl` a **second** time.
- A cancel after minting shows the "old image was already removed" copy.

## ACs

- Asking the chat to add an actor and answering "yes" produces a card with a
  drop zone, against the right actor.
- Dropping a JPEG uploads it, the card walks bar → processing → image, and the
  actor's picture is correct on its detail page without a reload.
- No network request leaves the renderer between the card appearing and a file
  being chosen.
- Replacing an actor that already has an image asks first, in words that say the
  old one is gone.
- Cancelling mid-upload leaves the card saying the image was removed, and
  retrying works.
- A dropped `.txt` is refused in the card, before any URL is minted.
- `npm run lint`, `npm run typecheck` and `npm test` green.

## Test plan

1. `npm run dev` (dev backend, per TD-060).
2. Chat: "add an actor called TD075 Test". Confirm the answer ends with the
   offer and that **no card appears yet**.
3. "yes" → drop zone appears naming that actor.
4. Drop a JPEG. Watch the bar, then processing, then the image.
5. Navigate to Actors, find the actor, confirm the image is there.
6. Chat again on the same actor: "upload a new image for TD075 Test" → confirm
   the replace warning appears this time and did not in step 3.
7. Cancel mid-upload; confirm the copy says the old image is gone; retry;
   confirm it succeeds.
8. Drop a `.txt`; confirm the refusal, and confirm via devtools that no
   `/upload` POST was sent.

## Out of scope

- Record video upload from the chat. The card supports `entityType: 'record'`
  because the contract does and excluding it would be extra code, but a 4GB
  video through this path wants resume, a stall watchdog and a real queue —
  that is `halo-desktop`'s `src/main/ipc/upload.ts` worth of work and it is a
  separate ticket. **Verify before merge whether large video is reachable here,
  and if it is, either cap the size in the card or cut the ticket.**
- The four record thumbnail slots (`request_image_slot_upload_url`). Needs a
  slot picker and a card that can explain why it is not `reprocess_record`.
- Extracting the drop zone into a shared `@swaff-y/thunder-chat-ui-web` with
  web-thunder's THW-30. Do it after both exist, not before.
