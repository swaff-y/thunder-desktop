import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildListUrl, fetchFranchiseRecords, fetchFranchises } from "../halo";

const get = vi.fn();

vi.mock("../client", () => ({
  default: { get: (...args: unknown[]) => get(...args) },
  getAuthHeaders: () => ({}),
  getCachedCreds: () => null,
}));

describe("buildListUrl gender", () => {
  it("sends the literal halo accepts", () => {
    expect(buildListUrl("v1/actor", { gender: "female" })).toBe(
      "v1/actor?limit=50&gender=female"
    );
    expect(buildListUrl("v1/actor", { gender: "male" })).toBe(
      "v1/actor?limit=50&gender=male"
    );
  });

  it("omits the key entirely when there is no selection", () => {
    expect(buildListUrl("v1/actor", {})).toBe("v1/actor?limit=50");
    expect(buildListUrl("v1/actor", { gender: null })).toBe("v1/actor?limit=50");
    expect(buildListUrl("v1/actor", { gender: undefined })).toBe("v1/actor?limit=50");
  });

  it("composes with filter and start_key", () => {
    expect(
      buildListUrl("v1/actor", {
        filter: " anna ",
        gender: "female",
        lastEvaluatedKey: "abc",
      })
    ).toBe("v1/actor?limit=50&start_key=abc&filter=anna&gender=female");
  });
});

describe("buildListUrl gender defence in depth", () => {
  it("drops anything that is not one of the two literals", () => {
    for (const bogus of ["f", "m", "", "FEMALE", "male female"]) {
      expect(buildListUrl("v1/actor", { gender: bogus as never })).toBe("v1/actor?limit=50");
    }
  });
});

/**
 * TD-096: the two new ports. `gender` is the caller's to withhold — the app
 * gates it on `config.genderFilterable`, so what matters here is that nothing
 * in the franchise paths invents one.
 */
describe("the franchise fetchers", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ data: { data: [], meta: {} } });
  });

  it("lists franchises off v1/franchise", async () => {
    await fetchFranchises({});
    expect(get).toHaveBeenCalledWith("v1/franchise?limit=50");
  });

  it("carries the cursor and a trimmed filter, and never a gender", async () => {
    await fetchFranchises({
      lastEvaluatedKey: "abc",
      filter: " tide ",
      gender: null,
    });
    expect(get).toHaveBeenCalledWith("v1/franchise?limit=50&start_key=abc&filter=tide");
  });

  it("lists a franchise's records off v1/franchise/{id}/records", async () => {
    await fetchFranchiseRecords("f-1", {});
    expect(get).toHaveBeenCalledWith("v1/franchise/f-1/records?limit=50");
  });

  it("carries the cursor and a trimmed filter into the records path, without gender", async () => {
    await fetchFranchiseRecords("f-1", {
      lastEvaluatedKey: "abc",
      filter: " tide ",
      gender: null,
    });
    expect(get).toHaveBeenCalledWith(
      "v1/franchise/f-1/records?limit=50&start_key=abc&filter=tide"
    );
  });
});
