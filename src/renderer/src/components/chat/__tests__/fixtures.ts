import type {
  ChartBar,
  ChatAction,
  ChatAskResult,
  UploadTarget,
} from "@swaff-y/thunder-chat-core";

export const NO_ACTION: ChatAction = {
  kind: "none",
  tool: null,
  args: {},
  title: "",
  result: null,
};

export function answer(text: string, action: ChatAction = NO_ACTION): ChatAskResult {
  return { ok: true, text, action, truncated: false };
}

export function listAction(
  tool: string,
  args: Record<string, unknown>,
  result: unknown
): ChatAction {
  return { kind: "list", tool, args, title: tool, result };
}

export function singleAction(
  tool: string,
  args: Record<string, unknown>,
  result: unknown
): ChatAction {
  return { kind: "single", tool, args, title: tool, result };
}

export function chartAction(
  tool: string,
  title: string,
  metricLabel: string,
  bars: ChartBar[]
): ChatAction {
  return { kind: "chart", tool, args: {}, title, result: null, metricLabel, bars };
}

export function uploadAction(
  target: UploadTarget | undefined,
  result: unknown,
  title = "Upload an image"
): ChatAction {
  return { kind: "upload", tool: "upload_action", args: {}, title, result, target };
}

/**
 * TC-031's own capture, from thunder-context's
 * `spec/fixtures/search_web_images_result.json` — real hosts, real ratios,
 * and one page title long enough to be worth truncating.
 */
export const TOM_HARDY_IMAGES: Record<string, unknown>[] = [
  {
    image_url:
      "https://media.gq.com/photos/56abd30600846cff09be5ad1/1:1/w_1108,h_1108,c_limit/tom-hardy-ghosting-oscars-v2.gif",
    thumbnail_url:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRIQv7agzRlTphPOmQDsBN1_E0hsq9LheJhiM_tRAQCMg&s=10",
    width: 1108,
    height: 1108,
    source_host: "media.gq.com",
    title: "Why Tom Hardy's Oscar Campaign Involves So Little Campaigning | GQ",
  },
  {
    image_url:
      "https://i0.wp.com/media.giphy.com/media/132CnKio1YFx8Q/giphy.gif?resize=500%2C280&ssl=1",
    thumbnail_url:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_AppMxxWqpkdxmrohh2A81pMMYDbzJedh1vPKemgQVQ&s=10",
    width: 500,
    height: 280,
    source_host: "i0.wp.com",
    title: "Top 10 Best Tom Hardy Performances | MovieBabble",
  },
  {
    image_url:
      "https://pyxis.nymag.com/v1/imgs/127/6e1/4dc52977fef4e12e35ee92e1a2657aab47-1-Bronsongifv3.2x.w710.gif",
    thumbnail_url:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3PIl_cqJb_CTHF55YVUHAfFSCZGRhxlhdJj3JF4ACZA&s=10",
    width: 750,
    height: 498,
    source_host: "pyxis.nymag.com",
    title: "6 Times Tom Hardy Proved He's a Legitimate Movie Star",
  },
  {
    image_url: "https://i.redd.it/2e3unlkvg8f81.gif",
    thumbnail_url:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSECKZkI_WHPoDIHmYxAnPwf_inhYiMNCsgg5J57r2Nag&s=10",
    width: 500,
    height: 249,
    source_host: "i.redd.it",
    title: "Tom Hardy : r/LadyBoners",
  },
  {
    image_url: "https://therandyreport.com/wp-content/uploads/2014/04/Tomhardy-undresses.gif",
    thumbnail_url:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxl7mFwuHTb3y_WTk9tyDUxyYDJsfndUKygDc1Shh-Hg&s=10",
    width: 443,
    height: 666,
    source_host: "therandyreport.com",
    title: "Tom Hardy undresses for you",
  },
];

export function webImagesAction(
  query: string,
  images: unknown[] = TOM_HARDY_IMAGES,
  title = "Images from the web"
): ChatAction {
  return {
    kind: "web_images",
    tool: "search_web_images",
    args: { query },
    title,
    result: { images },
  };
}

export function deferredAnswer(): {
  promise: Promise<ChatAskResult>;
  resolve: (result: ChatAskResult) => void;
} {
  let resolve!: (result: ChatAskResult) => void;
  const promise = new Promise<ChatAskResult>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
