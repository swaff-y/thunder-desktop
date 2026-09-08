import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PROCESSING_POLL_MIN_MS,
  PROCESSING_TIMEOUT_MS,
  type ChatAction,
  type UploadTarget,
} from "@swaff-y/thunder-chat-core";
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
  // TD-079: every attempt reads the subject before it mints. `processed` is
  // the answer that lets it through; the tests that care override it.
  fetchEntity.mockResolvedValue(subject("processed"));
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

/**
 * TD-079: `POST /upload` refuses a subject that is mid-pipeline, and minting
 * is what makes one — so a card that mints blind offers a **Try again** that
 * cannot ever work. The pre-flight `GET` is the only non-destructive way to
 * know, and every path to the network goes through it.
 */
describe("ActionCardUpload against a processing subject", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits rather than minting into a guaranteed 400", async () => {
    fetchEntity.mockResolvedValue(subject("processing"));
    renderCard(uploadAction(TOM, subject("processing")));

    await drop(jpeg());

    expect(screen.getByText(/Tom Hardy is still processing\. Waiting for Halo/)).toBeInTheDocument();
    expect(requestUploadUrl).not.toHaveBeenCalled();
    expect(screen.queryByText(/Drop an image here/)).not.toBeInTheDocument();
  });

  it("mints exactly once, and uploads, the moment the subject settles", async () => {
    vi.useFakeTimers();
    fetchEntity.mockResolvedValueOnce(subject("processing")).mockResolvedValue(subject("processed"));
    requestUploadUrl.mockResolvedValue({ id: "f93d", uploadUrl: "https://s3.test/put" });
    putUpload.mockResolvedValue(undefined);
    renderCard(uploadAction(TOM, subject("processing")));

    await drop(jpeg());
    expect(requestUploadUrl).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROCESSING_POLL_MIN_MS);
    });

    expect(requestUploadUrl).toHaveBeenCalledTimes(1);
    expect(putUpload).toHaveBeenCalledTimes(1);
  });

  it("gives up with a message worth acting on rather than a retry that will 400", async () => {
    vi.useFakeTimers();
    fetchEntity.mockResolvedValue(subject("processing"));
    renderCard(uploadAction(TOM, subject("processing")));

    await drop(jpeg());
    await act(async () => {
      // Generously past the bound: the backoff overshoots it by one gap.
      await vi.advanceTimersByTimeAsync(PROCESSING_TIMEOUT_MS * 2);
    });

    expect(
      screen.getByText(/Tom Hardy is still processing\. Try again once it finishes/)
    ).toBeInTheDocument();
    expect(requestUploadUrl).not.toHaveBeenCalled();
  });

  it("mints anyway when the pre-flight read is the thing that failed", async () => {
    fetchEntity.mockRejectedValue(new Error("Gateway timeout"));
    requestUploadUrl.mockResolvedValue({ id: "f93d", uploadUrl: "https://s3.test/put" });
    putUpload.mockReturnValue(new Promise(() => {}));
    renderCard(uploadAction(TOM, subject("processing")));

    await drop(jpeg());

    expect(requestUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("waits on the read instead of re-minting when a failed upload is retried", async () => {
    const user = userEvent.setup();
    requestUploadUrl.mockResolvedValue({ id: "f93d", uploadUrl: "https://s3.test/put" });
    putUpload.mockRejectedValue(new Error("The bucket refused it."));
    renderCard(uploadAction(TOM, subject("processing")));

    await drop(jpeg());
    expect(requestUploadUrl).toHaveBeenCalledTimes(1);

    // What the mint itself left behind, and what a real retry walks into.
    fetchEntity.mockResolvedValue(subject("processing"));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText(/Tom Hardy is still processing\. Waiting for Halo/)).toBeInTheDocument();
    expect(requestUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("issues nothing further once the wait is cancelled", async () => {
    const user = userEvent.setup();
    fetchEntity.mockResolvedValue(subject("processing"));
    renderCard(uploadAction(TOM, subject("processing")));

    await drop(jpeg());
    const reads = fetchEntity.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/Waiting for Halo/)).not.toBeInTheDocument();
    expect(fetchEntity).toHaveBeenCalledTimes(reads);
    expect(requestUploadUrl).not.toHaveBeenCalled();
  });

  it("gives the wait to the newest attempt when two drops overlap", async () => {
    let releaseFirstRead!: (subject: Record<string, unknown>) => void;
    fetchEntity
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseFirstRead = resolve;
        })
      )
      .mockResolvedValue(subject("processing"));
    renderCard(uploadAction(TOM, subject("processing")));

    // The drop zone is still up during the first read, so a second drop
    // lands before the first attempt has announced anything.
    await drop(jpeg());
    await drop(jpeg());

    // The first attempt comes back last, and with the happier answer.
    await act(async () => {
      releaseFirstRead(subject("processed"));
    });

    expect(screen.getByText(/Waiting for Halo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(requestUploadUrl).not.toHaveBeenCalled();
  });

  it("prints Halo's own sentence when the mint is refused", async () => {
    requestUploadUrl.mockRejectedValue(
      new Error("Record is not in a replaceable state (current: processing)")
    );
    renderCard(uploadAction(TOM, subject("processing")));

    await drop(jpeg());

    expect(screen.getByText(/Record is not in a replaceable state/)).toBeInTheDocument();
    expect(screen.queryByText(/status code 400/)).not.toBeInTheDocument();
  });
});
