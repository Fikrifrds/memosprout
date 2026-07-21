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

      // POST /process — LLM-powered detection + extraction (correction | feedback | none)
      if (method === "POST" && path === "/process") {
        const body = await readBody(req);
        const result = await ms.processMessage(
          String(body.message ?? ""),
          String(body.previousAnswer ?? ""),
          body.domain ? String(body.domain) : undefined,
        );
        json(res, 200, result);
        return;
      }

      // POST /feedback — capture a feedback signal (not a correction)
      if (method === "POST" && path === "/feedback") {
        const body = await readBody(req);
        const record = await ms.feedback({
          topic: String(body.topic ?? ""),
          message: String(body.message ?? ""),
          domain: body.domain ? String(body.domain) : undefined,
          by: body.by ? String(body.by) : undefined,
          role: body.role ? (String(body.role) as never) : undefined,
        });
        json(res, 201, record);
        return;
      }

      // GET /feedback/summary — aggregate feedback signals by topic
      if (method === "GET" && path === "/feedback/summary") {
        const domain = url.searchParams.get("domain") ?? undefined;
        const summary = await ms.feedbackSummary(domain);
        json(res, 200, { summary });
        return;
      }

      // GET /report — outcome tracking report
      if (method === "GET" && path === "/report") {
        const domain = url.searchParams.get("domain") ?? undefined;
        const report = await ms.report(domain);
        json(res, 200, report);
        return;
      }

      // POST /refresh-staleness — re-evaluate all corrections for staleness
      if (method === "POST" && path === "/refresh-staleness") {
        const result = await ms.refreshStaleness();
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

      // /corrections/:id and sub-resources (/audit, /validate, /approve)
      if (path.startsWith("/corrections/")) {
        const segments = path.split("/").filter(Boolean); // ["corrections", id, sub?]
        const id = segments[1];
        const sub = segments[2];

        if (method === "GET" && sub === "audit") {
          const history = await ms.audit(id);
          json(res, 200, { history });
          return;
        }

        if (method === "POST" && sub === "validate") {
          const result = await ms.validate(id);
          json(res, 200, result);
          return;
        }

        if (method === "POST" && sub === "approve") {
          const correction = await ms.approve(id);
          json(res, 200, correction);
          return;
        }

        if (method === "GET" && !sub) {
          const correction = await ms.get(id);
          if (!correction) {
            json(res, 404, { error: "Correction not found." });
            return;
          }
          json(res, 200, correction);
          return;
        }

        if (method === "DELETE" && !sub) {
          await ms.remove(id);
          json(res, 200, { deprecated: id });
          return;
        }
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
    console.log(`  POST /correct                  — capture a correction`);
    console.log(`  POST /process                  — LLM detect + extract (correction|feedback|none)`);
    console.log(`  POST /context                  — get corrections for a query`);
    console.log(`  POST /check                    — check an answer`);
    console.log(`  POST /feedback                 — capture a feedback signal`);
    console.log(`  GET  /feedback/summary         — aggregate feedback by topic`);
    console.log(`  GET  /report                   — outcome tracking report`);
    console.log(`  POST /refresh-staleness        — re-evaluate corrections for staleness`);
    console.log(`  GET  /corrections              — list corrections`);
    console.log(`  GET  /corrections/:id          — get one correction`);
    console.log(`  GET  /corrections/:id/audit    — correction audit trail`);
    console.log(`  POST /corrections/:id/validate — validate against oracle`);
    console.log(`  POST /corrections/:id/approve  — approve a correction`);
    console.log(`  DELETE /corrections/:id        — deprecate a correction`);
    console.log(`  GET  /health                   — health check`);
  });
}
