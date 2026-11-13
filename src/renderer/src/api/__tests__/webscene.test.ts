import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const del = vi.fn();
const get = vi.fn();

vi.mock("../client", () => ({
  default: {
    post: (...args: unknown[]) => post(...args),
    delete: (...args: unknown[]) => del(...args),
    get: (...args: unknown[]) => get(...args),
  },
  getAuthHeaders: () => ({}),
  getCachedCreds: () => null,
}));

const {
  createWebscene,
  deleteWebscene,
  fetchWebsceneRecords,
  fetchWebscenes,
  unassociateWebscene,
} = await import("../halo");

const WEBSCENE = { id: "0cea8e0be146e65d8dab", name: "A Webscene" };

function refusal(reason: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", config, null, {
    status: 400,
    statusText: "Bad Request",
    data: { message: reason },
    headers: {},
    config,
  });
}

beforeEach(() => {
  post.mockReset();
  del.mockReset();
  get.mockReset();
});

describe("webscene ports", () => {
  it("creates a webscene by name", async () => {
    post.mockResolvedValue({ data: { data: WEBSCENE } });

    await expect(createWebscene("A Webscene")).resolves.toEqual(WEBSCENE);
    expect(post).toHaveBeenCalledWith("v1/webscene", { name: "A Webscene" });
  });

  it("unassociates and deletes by id", async () => {
    post.mockResolvedValue({ data: { data: WEBSCENE } });
    del.mockResolvedValue({ data: { data: WEBSCENE } });

    await unassociateWebscene(WEBSCENE.id);
    await deleteWebscene(WEBSCENE.id);

    expect(post).toHaveBeenCalledWith(`v1/webscene/${WEBSCENE.id}/unassociate`);
    expect(del).toHaveBeenCalledWith(`v1/webscene/${WEBSCENE.id}`);
  });

  it("reports halo's reason when it refuses a delete", async () => {
    del.mockRejectedValue(refusal("Cannot delete"));

    await expect(deleteWebscene(WEBSCENE.id)).rejects.toThrow("Cannot delete");
  });

  it("lists webscenes and their records off halo's own paths", async () => {
    get.mockResolvedValue({ data: { data: [], meta: {} } });

    await fetchWebscenes({});
    await fetchWebsceneRecords(WEBSCENE.id, {});

    expect(get).toHaveBeenCalledWith("v1/webscene?limit=50");
    expect(get).toHaveBeenCalledWith(`v1/webscene/${WEBSCENE.id}/records?limit=50`);
  });
});
