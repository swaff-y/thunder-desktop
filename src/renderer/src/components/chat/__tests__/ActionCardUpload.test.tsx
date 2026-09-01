import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChatAction, UploadTarget } from "@swaff-y/thunder-chat-core";
import ActionCardUpload from "../ActionCardUpload";
import { uploadAction } from "./fixtures";

const requestUploadUrl = vi.fn();
const putUpload = vi.fn();
const fetchEntity = vi.fn();

vi.mock("../../../api/halo", () => ({
  requestUploadUrl: (...args: unknown[]) => requestUploadUrl(...args),
  putUpload: (...args: unknown[]) => putUpload(...args),
  fetchEntity: (...args: unknown[]) => fetchEntity(...args),
}));

vi.mock("../useActionImages", () => ({
  useActionImages: () => ({ slides: [], isLoading: false, isError: false }),
}));

const TOM: UploadTarget = { entityType: "actor", id: "f93d", name: "Tom Hardy" };

/** Halo's grounding result — `processed` is the one that has a picture to lose. */
function subject(status: string): Record<string, unknown> {
  return { id: "f93d", status };
}

function renderCard(action: ChatAction) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActionCardUpload action={action} />
    </QueryClientProvider>
  );
}

function jpeg(): File {
  return new File(["bytes"], "tom.jpg", { type: "image/jpeg" });
}

function dropZone(): HTMLElement {
  return screen.getByText(/Drop an image here/).closest("label") as HTMLElement;
}

async function drop(...files: File[]): Promise<void> {
  await act(async () => {
    fireEvent.drop(dropZone(), { dataTransfer: { files } });
  });
}

/**
 * A PUT that hangs until the flow aborts it — which is what axios does on a
 * real cancel, and what lets the flow release its attempt so retry can run.
 */
function hangingPut(): void {
  putUpload.mockImplementation(
    (_url: string, _file: Blob, _onProgress: unknown, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("The upload was cancelled.")));
      })
  );
}

/** Lets the abort rejection propagate through the flow before asserting. */
async function flush(): Promise<void> {
  await act(async () => {});
}

beforeEach(() => {
  requestUploadUrl.mockReset();
  putUpload.mockReset();
  fetchEntity.mockReset();
});

describe("ActionCardUpload", () => {
  it("draws a drop zone for a valid upload action", () => {
    renderCard(uploadAction(TOM, subject("processing"), "Upload an image for Tom Hardy"));

    expect(
      screen.getByRole("heading", { name: "Upload an image for Tom Hardy" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Drop an image here/)).toBeInTheDocument();
    expect(screen.getByLabelText(/choose a file/i)).toHaveAttribute("accept", "image/*");
  });

  it("draws nothing for a target the package will not vouch for", () => {
    const franchise = { entityType: "franchise", id: "f93d", name: "Marvel" };
    const { container } = renderCard(uploadAction(franchise, subject("processing")));
    expect(container).toBeEmptyDOMElement();

    const { container: blank } = renderCard(
      uploadAction({ entityType: "actor", id: "" }, subject("processing"))
    );
    expect(blank).toBeEmptyDOMElement();
  });

  it("sends nothing at all until a file is supplied", () => {
    renderCard(uploadAction(TOM, subject("processing")));

    expect(requestUploadUrl).not.toHaveBeenCalled();
    expect(putUpload).not.toHaveBeenCalled();
    expect(fetchEntity).not.toHaveBeenCalled();
  });

  it("asks before replacing a picture, and cancelling there mints nothing", async () => {
    const user = userEvent.setup();
    renderCard(uploadAction(TOM, subject("processed")));

    await drop(jpeg());

    expect(screen.getByText(/Tom Hardy already has an image/)).toBeInTheDocument();
    expect(requestUploadUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(requestUploadUrl).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing was uploaded/)).toBeInTheDocument();
  });

  it("refuses a file that is not an image, before anything is minted", async () => {
    renderCard(uploadAction(TOM, subject("processing")));

    await drop(new File(["hello"], "notes.txt", { type: "text/plain" }));

    expect(screen.getByText(/notes\.txt is not an image/)).toBeInTheDocument();
    expect(requestUploadUrl).not.toHaveBeenCalled();
  });

  it("takes the first of several dropped files and says the rest were ignored", async () => {
    requestUploadUrl.mockReturnValue(new Promise(() => {}));
    renderCard(uploadAction(TOM, subject("processing")));

    await drop(jpeg(), new File([""], "two.jpg", { type: "image/jpeg" }));

    expect(screen.getByText(/Uploading tom\.jpg\. The other 1 were ignored/)).toBeInTheDocument();
  });

  it("surfaces a failed upload and mints again on retry", async () => {
    const user = userEvent.setup();
    requestUploadUrl.mockResolvedValue({ id: "f93d", uploadUrl: "https://s3.test/put" });
    putUpload.mockRejectedValue(new Error("The bucket refused it."));

    renderCard(uploadAction(TOM, subject("processing")));
    await drop(jpeg());

    expect(screen.getByText("The bucket refused it.")).toBeInTheDocument();
    expect(requestUploadUrl).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(requestUploadUrl).toHaveBeenCalledTimes(2);
  });

  it("says the old image is already gone when a cancel lands after minting", async () => {
    const user = userEvent.setup();
    requestUploadUrl.mockResolvedValue({ id: "f93d", uploadUrl: "https://s3.test/put" });
    hangingPut();

    renderCard(uploadAction(TOM, subject("processing")));
    await drop(jpeg());

    expect(screen.getByText(/Uploading Tom Hardy's image/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText(/The old image was already removed/)).toBeInTheDocument();
  });

  it("mints again when the reader retries after cancelling", async () => {
    const user = userEvent.setup();
    requestUploadUrl.mockResolvedValue({ id: "f93d", uploadUrl: "https://s3.test/put" });
    hangingPut();

    renderCard(uploadAction(TOM, subject("processing")));
    await drop(jpeg());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await flush();

    expect(requestUploadUrl).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(requestUploadUrl).toHaveBeenCalledTimes(2);
  });
});
