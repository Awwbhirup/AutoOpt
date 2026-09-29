import { describe, expect, it } from "vitest";

import { ServiceError } from "./service";
import { classifyServiceError } from "./service-errors";

describe("classifyServiceError", () => {
  it("names the limits the service enforces", () => {
    expect(classifyServiceError(new ServiceError("x", 503)).problem).toBe("busy");
    expect(classifyServiceError(new ServiceError("x", 413)).problem).toBe("too_large");
    expect(classifyServiceError(new ServiceError("x", 504)).problem).toBe("timeout");
  });

  it("treats no answer as offline and keeps other refusals' own words", () => {
    expect(classifyServiceError(new TypeError("fetch failed")).problem).toBe("offline");
    expect(classifyServiceError(new ServiceError("AUTOOPT_SERVICE_URL is not set")).problem).toBe("offline");
    expect(classifyServiceError(new ServiceError("unknown method", 422))).toEqual({
      problem: "refused",
      message: "unknown method",
    });
    expect(classifyServiceError(new ServiceError("compute service returned no body")).problem).toBe("refused");
  });

  it("does not repeat an unrelated error's text", () => {
    expect(classifyServiceError(new Error("connect ECONNREFUSED 10.0.0.4:5432"))).toEqual({
      problem: "failed",
      message: "the run could not be completed",
    });
  });
});
