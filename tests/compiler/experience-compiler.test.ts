import { describe, expect, it } from "vitest";

import {
  compileExperience,
  type ExperienceTransport,
  type ExperienceTransportRequest,
} from "@/lib/compiler/experience-compiler";
import type { CandidateSproutContent } from "@/lib/domain/schemas";

const idempotencyContent: CandidateSproutContent = {
  title: "Payment events must be processed idempotently",
  type: "Agent Experience",
  trigger: "A task implements the payment webhook handler.",
  procedure: [
    "Use the provider event id as the idempotency key.",
    "Protect terminal order states.",
  ],
  prohibitedActions: ["Do not process the same event id twice."],
  scope: { paths: ["src/webhook-handler.ts"] },
  uncertainties: [],
  recommendedArtifact: "ci_and_hook",
};

const evidence = {
  scenario: "idempotency",
  task: "Implement the payment webhook handler.",
  failedSummary: "The handler double-charged on a duplicate callback.",
  humanCorrection: "Use the provider event id as the idempotency key.",
};

function mockTransport(
  content: CandidateSproutContent,
  capture?: (request: ExperienceTransportRequest) => void,
): ExperienceTransport {
  return {
    async parse(request) {
      capture?.(request);
      return {
        id: "resp_test",
        model: "gpt-5.6-sol",
        status: "completed",
        output_parsed: content,
        output: [],
      };
    },
  };
}

describe("compileExperience", () => {
  it("compiles a Candidate Sprout for the idempotency scenario", async () => {
    let captured: ExperienceTransportRequest | undefined;
    const result = await compileExperience({
      evidence,
      transport: mockTransport(idempotencyContent, (request) => {
        captured = request;
      }),
    });
    expect(result.content).toEqual(idempotencyContent);
    expect(result.provenance).toEqual({
      modelReturned: "gpt-5.6-sol",
      responseId: "resp_test",
    });
    expect(captured?.systemPrompt).toContain("idempotency");
  });

  it("compiles a Candidate Sprout for the soft-delete scenario", async () => {
    const softDeleteContent: CandidateSproutContent = {
      ...idempotencyContent,
      title: "Users must be soft-deleted",
      scope: { paths: ["src/user-service.ts"] },
    };
    let captured: ExperienceTransportRequest | undefined;
    const result = await compileExperience({
      evidence: {
        scenario: "soft-delete",
        task: "Implement user deletion.",
        failedSummary: "The service hard-deleted the user record.",
        humanCorrection: "Soft-delete by setting deletedAt.",
      },
      transport: mockTransport(softDeleteContent, (request) => {
        captured = request;
      }),
    });
    expect(result.content.title).toBe("Users must be soft-deleted");
    expect(captured?.systemPrompt).toContain("soft-delete");
  });

  it("throws missing_credentials without a transport or API key", async () => {
    await expect(compileExperience({ evidence })).rejects.toMatchObject({
      code: "missing_credentials",
    });
  });

  it("throws refusal when the model refuses", async () => {
    const transport: ExperienceTransport = {
      async parse() {
        return {
          id: "resp_refusal",
          model: "gpt-5.6-sol",
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
        };
      },
    };
    await expect(compileExperience({ evidence, transport })).rejects.toMatchObject({
      code: "refusal",
    });
  });

  it("throws malformed_output when the content fails the schema", async () => {
    const transport: ExperienceTransport = {
      async parse() {
        return {
          id: "resp_bad",
          model: "gpt-5.6-sol",
          status: "completed",
          output_parsed: { title: "incomplete" },
          output: [],
        };
      },
    };
    await expect(compileExperience({ evidence, transport })).rejects.toMatchObject({
      code: "malformed_output",
    });
  });
});
