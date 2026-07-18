import { describe, expect, it } from "vitest";

import {
  CandidateExtractionError,
  candidateModel,
  createSeededCandidate,
  extractLiveCandidate,
  loadSeededCandidate,
  loadSeededEvidence,
  type CandidateTransport,
} from "@/lib/openai/extract-candidate";
import { buildCandidateEvidenceInput } from "@/lib/openai/prompt";

const validContent = {
  title: "Generated files must not be edited directly",
  type: "Agent Experience" as const,
  trigger: "A generated API client change is requested.",
  procedure: [
    "Modify api/openapi.yaml.",
    "Run the generator and tests.",
  ],
  prohibitedActions: ["Do not edit generated files directly."],
  scope: { paths: ["api/openapi.yaml", "generated/**"] },
  uncertainties: [],
  recommendedArtifact: "ci_check" as const,
};

function transportReturning(response: unknown): CandidateTransport {
  return { parse: async () => response };
}

function completedResponse(parsed: unknown) {
  return {
    id: "resp_phase2_test",
    model: candidateModel,
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", parsed }],
      },
    ],
  };
}

describe("Candidate Sprout extraction", () => {
  it("parses a valid structured GPT-5.6 response", async () => {
    const candidate = await extractLiveCandidate({
      evidence: await loadSeededEvidence(),
      transport: transportReturning(completedResponse(validContent)),
      now: () => new Date("2026-07-18T10:00:00.000Z"),
    });

    expect(candidate).toMatchObject({
      ...validContent,
      provenance: {
        source: "live",
        modelRequested: "gpt-5.6-sol",
        modelReturned: "gpt-5.6-sol",
        responseId: "resp_phase2_test",
      },
    });
  });

  it("rejects malformed model output instead of weakening the schema", async () => {
    const malformed = { ...validContent } as Record<string, unknown>;
    delete malformed.procedure;

    await expect(
      extractLiveCandidate({
        evidence: await loadSeededEvidence(),
        transport: transportReturning(completedResponse(malformed)),
      }),
    ).rejects.toMatchObject({ code: "malformed_output" });
  });

  it("reports refusals distinctly", async () => {
    await expect(
      extractLiveCandidate({
        evidence: await loadSeededEvidence(),
        transport: transportReturning({
          id: "resp_refusal",
          model: candidateModel,
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "refusal", refusal: "Request refused." }],
            },
          ],
        }),
      }),
    ).rejects.toMatchObject({ code: "refusal" });
  });

  it("reports incomplete responses distinctly", async () => {
    await expect(
      extractLiveCandidate({
        evidence: await loadSeededEvidence(),
        transport: transportReturning({
          id: "resp_incomplete",
          model: candidateModel,
          status: "incomplete",
          output: [],
        }),
      }),
    ).rejects.toMatchObject({ code: "incomplete" });
  });

  it("reports transport timeouts without exposing the upstream message", async () => {
    const transport: CandidateTransport = {
      async parse() {
        const error = new Error("sensitive upstream diagnostic");
        error.name = "APIConnectionTimeoutError";
        throw error;
      },
    };

    await expect(
      extractLiveCandidate({
        evidence: await loadSeededEvidence(),
        transport,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "timeout",
        message: "The live GPT-5.6 Candidate request timed out.",
      }),
    );
  });

  it("reports invalid credentials safely", async () => {
    const transport: CandidateTransport = {
      async parse() {
        throw { status: 401, message: "credential detail" };
      },
    };

    await expect(
      extractLiveCandidate({
        evidence: await loadSeededEvidence(),
        transport,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "invalid_credentials",
        message:
          "OpenAI rejected the configured credentials. Verify API access without exposing the key.",
      }),
    );
  });

  it("fails clearly when live credentials are unavailable", async () => {
    await expect(
      extractLiveCandidate({ evidence: await loadSeededEvidence() }),
    ).rejects.toBeInstanceOf(CandidateExtractionError);
    await expect(
      extractLiveCandidate({ evidence: await loadSeededEvidence() }),
    ).rejects.toMatchObject({ code: "missing_credentials" });
  });

  it("sends only the four validated evidence records to the prompt", async () => {
    const input = buildCandidateEvidenceInput(await loadSeededEvidence());
    const parsed = JSON.parse(input) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual([
      "failed_agent_run",
      "human_correction",
      "corrected_outcome",
      "deterministic_evidence",
    ]);
    expect(input).not.toContain("OPENAI_API_KEY");
    expect(input).not.toContain("/Users/");
    expect(input).not.toContain("README.md");
  });

  it("recreates the seeded Candidate deterministically", async () => {
    const evidence = await loadSeededEvidence();
    const first = createSeededCandidate(evidence);
    const second = createSeededCandidate(evidence);

    expect(first).toEqual(second);
    expect(first).toEqual(await loadSeededCandidate());
    expect(first.provenance).toMatchObject({
      source: "seeded",
      modelReturned: null,
      responseId: null,
    });
  });
});
