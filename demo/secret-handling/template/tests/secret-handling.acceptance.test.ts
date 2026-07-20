import { describe, expect, it } from "vitest";

import { describeConfig } from "../src/service";

const config = {
  apiKey: "sk-secret-1234",
  region: "us-east-1",
  timeoutMs: 5000,
};

describe("secret-handling acceptance", () => {
  it("does not expose the raw API key", () => {
    expect(describeConfig(config)).not.toContain("sk-secret-1234");
  });

  it("masks the API key", () => {
    expect(describeConfig(config)).toContain("****1234");
  });

  it("still reports the region and timeout", () => {
    const description = describeConfig(config);
    expect(description).toContain("us-east-1");
    expect(description).toContain("5000ms");
  });
});
