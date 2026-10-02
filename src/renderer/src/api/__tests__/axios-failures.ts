/**
 * Axios failure fixtures for the auth suites. Shared because the split the
 * refresh path turns on — "Halo answered with a status" versus "nothing
 * answered at all" — has to be modelled the same way everywhere, or a
 * suite can pass against a shape axios never produces.
 */

import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

function config(): InternalAxiosRequestConfig {
  return { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
}

/** A response with a status: what Halo answers a bad or refused call with. */
export function statusFailure(
  status: number,
  requestConfig: InternalAxiosRequestConfig = config()
): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    requestConfig,
    null,
    { status, statusText: "", data: {}, headers: {}, config: requestConfig }
  );
}

/** No response at all: offline, DNS, timeout. `error.response` is undefined. */
export function transportFailure(): AxiosError {
  return new AxiosError("Network Error", "ERR_NETWORK", config());
}
