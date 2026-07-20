import { describe, expect, it } from "vitest";

import { maskSecret } from "@/demo/secret-handling/template/src/secrets";
import { describeConfig } from "@/demo/secret-handling/template/src/service";
import type { ServiceConfig } from "@/demo/secret-handling/template/src/types";

const config: ServiceConfig = {
  apiKey: "sk-secret-1234",
  region: "us-east-1",
  timeoutMs: 5000,
};

function correctDescribeConfig(value: ServiceConfig): string {
  return `region=${value.region} apiKey=${maskSecret(value.apiKey)} timeout=${value.timeoutMs}ms`;
}

describe("secret-handling scenario knowledge trap", () => {
  it("naive committed service passes the ordinary happy path", () => {
    expect(describeConfig(config)).toContain("us-east-1");
  });

  it("naive committed service exposes the raw API key", () => {
    expect(describeConfig(config)).toContain("sk-secret-1234");
  });

  it("correct service masks the API key", () => {
    const description = correctDescribeConfig(config);
    expect(description).not.toContain("sk-secret-1234");
    expect(description).toContain("****1234");
  });

  it("correct service still reports the region and timeout", () => {
    const description = correctDescribeConfig(config);
    expect(description).toContain("us-east-1");
    expect(description).toContain("5000ms");
  });
});
