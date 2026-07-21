import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { MemoSprout } from "@/lib/index";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

export function createApiServer(ms: MemoSprout, port: number = 3456): void {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // POST /correct — capture a correction
      if (method === "POST" && path === "/correct") {
        const body = await readBody(req);
        const correction = await ms.correct({
          wrong: String(body.wrong ?? ""),
          correct: String(body.correct ?? ""),
          domain: body.domain ? String(body.domain) : undefined,
          keywords: Array.isArray(body.keywords) ? (body.keywords as string[]) : undefined,
          entities: Array.isArray(body.entities) ? (body.entities as string[]) : undefined,
          explanation: body.explanation ? String(body.explanation) : undefined,
          source: body.source ? String(body.source) : undefined,
          by: body.by ? String(body.by) : undefined,
        });
        json(res, 201, correction);
        return;
      }

      // POST /context — get relevant corrections for a query
      if (method === "POST" && path === "/context") {
        const body = await readBody(req);
        const query = String(body.query ?? "");
        const domain = body.domain ? String(body.domain) : undefined;
        const result = await ms.context(query, domain);
        json(res, 200, result);
        return;
      }

      // POST /check — check an answer
      if (method === "POST" && path === "/check") {
        const body = await readBody(req);
        const answer = String(body.answer ?? "");
        const domain = body.domain ? String(body.domain) : undefined;
        const result = await ms.check(answer, domain);
        json(res, 200, result);
        return;
      }

      // GET /corrections — list corrections
      if (method === "GET" && path === "/corrections") {
        const status = url.searchParams.get("status") ?? undefined;
        const domain = url.searchParams.get("domain") ?? undefined;
        const keyword = url.searchParams.get("keyword") ?? undefined;
        const corrections = await ms.list({
          status: status as never,
          domain,
          keyword,
        });
        json(res, 200, { corrections, total: corrections.length });
        return;
      }

      // GET /corrections/:id — get one correction
      if (method === "GET" && path.startsWith("/corrections/")) {
        const id = path.split("/")[2];
        const correction = await ms.get(id);
        if (!correction) {
          json(res, 404, { error: "Correction not found." });
          return;
        }
        json(res, 200, correction);
        return;
      }

      // DELETE /corrections/:id — deprecate a correction
      if (method === "DELETE" && path.startsWith("/corrections/")) {
        const id = path.split("/")[2];
        await ms.remove(id);
        json(res, 200, { deprecated: id });
        return;
      }

      // GET /health
      if (method === "GET" && path === "/health") {
        json(res, 200, { status: "ok", version: "0.2.0" });
        return;
      }

      json(res, 404, { error: `Unknown endpoint: ${method} ${path}` });
    } catch (error) {
      json(res, 500, {
        error: error instanceof Error ? error.message : "Internal error.",
      });
    }
  });

  server.listen(port, () => {
    console.log(`MemoSprout API server running at http://localhost:${port}`);
    console.log(`  POST /correct     — capture a correction`);
    console.log(`  POST /context     — get corrections for a query`);
    console.log(`  POST /check       — check an answer`);
    console.log(`  GET  /corrections — list corrections`);
    console.log(`  GET  /health      — health check`);
  });
}
