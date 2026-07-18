import { z } from "zod";

import {
  CandidateExtractionError,
  extractLiveCandidate,
  loadSeededCandidate,
  loadSeededEvidence,
} from "@/lib/openai/extract-candidate";

const candidateRequestSchema = z
  .object({
    source: z.enum(["live", "seeded"]),
  })
  .strict();

const errorStatuses: Record<string, number> = {
  missing_credentials: 503,
  invalid_credentials: 401,
  timeout: 504,
  refusal: 422,
  incomplete: 422,
  malformed_output: 422,
  api_error: 502,
};

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_request", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  const requestResult = candidateRequestSchema.safeParse(body);
  if (!requestResult.success) {
    return Response.json(
      {
        error: {
          code: "invalid_request",
          message: "Request source must be either live or seeded.",
        },
      },
      { status: 400 },
    );
  }

  if (requestResult.data.source === "seeded") {
    return Response.json(
      { source: "seeded", candidate: await loadSeededCandidate() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const candidate = await extractLiveCandidate({
      evidence: await loadSeededEvidence(),
      apiKey: process.env.OPENAI_API_KEY,
    });

    return Response.json(
      { source: "live", candidate },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CandidateExtractionError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: errorStatuses[error.code] ?? 500 },
      );
    }

    return Response.json(
      {
        error: {
          code: "internal_error",
          message: "Candidate generation failed safely.",
        },
      },
      { status: 500 },
    );
  }
}
