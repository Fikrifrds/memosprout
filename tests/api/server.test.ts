import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MemoSprout } from "@/lib/index";
import { createApiServer } from "@/lib/api/server";

const API_KEY = "test-key-123";

let server: Server;
let baseUrl: string;

async function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads arbitrary response shapes
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const authed = { Authorization: `Bearer ${API_KEY}` };

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "memosprout-api-"));
  const ms = new MemoSprout(dir);
  server = createApiServer(ms, 0, { apiKey: API_KEY });
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  if (typeof address === "object" && address) {
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
});

afterAll(() => {
  server?.close();
});

describe("API auth", () => {
  it("allows /health without a key", async () => {
    const { status, json } = await request("GET", "/health");
    expect(status).toBe(200);
    expect(json.status).toBe("ok");
  });

  it("rejects requests without a key", async () => {
    const { status } = await request("GET", "/corrections");
    expect(status).toBe(401);
  });

  it("rejects requests with a wrong key", async () => {
    const { status } = await request("GET", "/corrections", undefined, {
      Authorization: "Bearer wrong",
    });
    expect(status).toBe(401);
  });

  it("accepts Bearer token", async () => {
    const { status } = await request("GET", "/corrections", undefined, authed);
    expect(status).toBe(200);
  });

  it("accepts x-api-key header", async () => {
    const { status } = await request("GET", "/corrections", undefined, { "x-api-key": API_KEY });
    expect(status).toBe(200);
  });
});

describe("API behavior", () => {
  it("returns 400 on invalid JSON body", async () => {
    const { status, json } = await request("POST", "/correct", "{not json", authed);
    expect(status).toBe(400);
    expect(json.error).toMatch(/Invalid JSON/);
  });

  it("creates and checks a correction end to end", async () => {
    const created = await request(
      "POST",
      "/correct",
      { wrong: "Refund takes 3 business days", correct: "Refund takes 5 business days" },
      authed,
    );
    expect(created.status).toBe(201);
    expect(created.json.status).toBe("active");

    const check = await request(
      "POST",
      "/check",
      { answer: "The refund takes 3 BUSINESS days!" },
      authed,
    );
    expect(check.status).toBe(200);
    expect(check.json.ok).toBe(false);
    expect(check.json.corrections[0].correct).toBe("Refund takes 5 business days");
  });

  it("returns 404 for approving a missing correction", async () => {
    const { status } = await request("POST", "/corrections/corr_missing/approve", {}, authed);
    expect(status).toBe(404);
  });

  it("returns 409 when approving a correction in the wrong status", async () => {
    const created = await request(
      "POST",
      "/correct",
      { wrong: "Active already", correct: "Still active" },
      authed,
    );
    // Created via agent role → already active → cannot be approved.
    const { status } = await request(
      "POST",
      `/corrections/${created.json.correctionId}/approve`,
      {},
      authed,
    );
    expect(status).toBe(409);
  });

  it("returns 404 when deleting a missing correction", async () => {
    const { status } = await request("DELETE", "/corrections/corr_missing", undefined, authed);
    expect(status).toBe(404);
  });

  it("returns 413 for oversized bodies", async () => {
    const { status } = await request(
      "POST",
      "/correct",
      { wrong: "x".repeat(1_100_000), correct: "y" },
      authed,
    );
    expect(status).toBe(413);
  });

  it("returns 404 for unknown endpoints", async () => {
    const { status } = await request("GET", "/nope", undefined, authed);
    expect(status).toBe(404);
  });
});

describe("rate limiting", () => {
  it("returns 429 after the per-minute limit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-api-rl-"));
    const ms = new MemoSprout(dir);
    const limited = createApiServer(ms, 0, { apiKey: API_KEY, rateLimitPerMinute: 3 });
    await new Promise<void>((resolve) => limited.on("listening", resolve));
    const address = limited.address();
    const rlBase = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${rlBase}/corrections`, { headers: authed });
      statuses.push(res.status);
    }
    limited.close();
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
    expect(statuses[4]).toBe(429);
  });
});

describe("createApiServer safety", () => {
  it("refuses non-loopback bind without an API key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memosprout-api-"));
    const ms = new MemoSprout(dir);
    expect(() => createApiServer(ms, 0, { apiKey: "", host: "0.0.0.0" })).toThrow(/API key/);
  });
});
