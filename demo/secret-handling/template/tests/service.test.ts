import { describe, expect, it } from "vitest";

import { describeConfig } from "../src/service";

describe("config service", () => {
  it("describes the region", () => {
    const description = describeConfig({
      apiKey: "sk-secret-1234",
      region: "us-east-1",
      timeoutMs: 5000,
    });
    expect(description).toContain("us-east-1");
  });
});
