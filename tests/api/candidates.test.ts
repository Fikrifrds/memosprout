import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as downloadOkf } from "@/app/api/artifacts/okf/route";
import { POST as generateCandidate } from "@/app/api/candidates/route";
import {
  okfContentType,
  okfDownloadFilename,
} from "@/lib/okf/render";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Candidate API route", () => {
  it("returns deterministic seeded output explicitly labeled as seeded", async () => {
    const response = await generateCandidate(
      new Request("http://example.test/api/candidates", {
        method: "POST",
        body: JSON.stringify({ source: "seeded" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.source).toBe("seeded");
    expect(body.candidate).toMatchObject({
      provenance: { source: "seeded", responseId: null },
    });
  });

  it("does not silently fall back to seeded output without live credentials", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await generateCandidate(
      new Request("http://example.test/api/candidates", {
        method: "POST",
        body: JSON.stringify({ source: "live" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("missing_credentials");
    expect(body).not.toHaveProperty("candidate");
  });

  it("rejects invalid request modes", async () => {
    const response = await generateCandidate(
      new Request("http://example.test/api/candidates", {
        method: "POST",
        body: JSON.stringify({ source: "automatic" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("OKF artifact route", () => {
  it("downloads the exact Markdown filename and media type", async () => {
    const response = await downloadOkf();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(okfContentType);
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="${okfDownloadFilename}"`,
    );
    expect(response.headers.get("X-MemoSprout-Source")).toBe("seeded");
    expect(await response.text()).toContain("type: Agent Experience");
  });
});
