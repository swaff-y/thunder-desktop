import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { haloFailure } from "../halo";

/** The 400 Halo answers a mint against a subject that is mid-pipeline with. */
const REFUSAL = {
  status: "fail",
  statusCode: 400,
  message: "Invalid parameters",
  errors: [
    {
      message: "Invalid parameters",
      invalid_fields: { status: "Record is not in a replaceable state (current: processing)" },
    },
  ],
};

function rejection(data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", config, null, {
    status: 400,
    statusText: "Bad Request",
    data,
    headers: {},
    config,
  });
}

describe("haloFailure", () => {
  it("prefers the field Halo named over the status code axios reports", () => {
    expect(haloFailure(rejection(REFUSAL)).message).toBe(
      "Record is not in a replaceable state (current: processing)"
    );
  });

  it("joins every invalid field, because a refusal can name more than one", () => {
    const two = { errors: [{ invalid_fields: { status: "Not replaceable.", name: "Too long." } }] };
    expect(haloFailure(rejection(two)).message).toBe("Not replaceable. Too long.");
  });

  it("falls back to the body's own message when no field is named", () => {
    expect(haloFailure(rejection({ message: "Invalid parameters" })).message).toBe(
      "Invalid parameters"
    );
  });

  it("keeps the axios error when the body says nothing useful", () => {
    // S3 answers a bad PUT in XML, and a dropped connection has no body at all.
    expect(haloFailure(rejection("<Error><Code>AccessDenied</Code></Error>")).message).toBe(
      "Request failed with status code 400"
    );
    expect(haloFailure(rejection(undefined)).message).toBe(
      "Request failed with status code 400"
    );
  });

  it("passes an ordinary error through untouched, cancels included", () => {
    const abort = new Error("canceled");
    abort.name = "CanceledError";
    expect(haloFailure(abort)).toBe(abort);
    expect(haloFailure("a string").message).toBe("a string");
  });
});
