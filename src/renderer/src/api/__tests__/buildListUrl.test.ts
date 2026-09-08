import { describe, expect, it } from "vitest";
import { buildListUrl } from "../halo";

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
