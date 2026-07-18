import { readFile } from "node:fs/promises";
import { join } from "node:path";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { createDeterministicId, idPrefixes } from "@/lib/domain/ids";
import {
  candidateEvidenceBundleSchema,
  candidateSproutContentSchema,
  candidateSproutSchema,
  type CandidateEvidenceBundle,
  type CandidateSprout,
  type CandidateSproutContent,
} from "@/lib/domain/schemas";
import {
  buildCandidateEvidenceInput,
  candidatePromptVersion,
  candidateSystemPrompt,
} from "@/lib/openai/prompt";

export const candidateModel = "gpt-5.6-sol" as const;
export const candidateTimeoutMs = 90_000;

export type CandidateExtractionErrorCode =
  | "missing_credentials"
  | "invalid_credentials"
  | "timeout"
  | "refusal"
  | "incomplete"
  | "malformed_output"
  | "api_error";

const safeErrorMessages: Record<CandidateExtractionErrorCode, string> = {
  missing_credentials:
    "Live Candidate generation requires an OPENAI_API_KEY environment variable.",
  invalid_credentials:
    "OpenAI rejected the configured credentials. Verify API access without exposing the key.",
  timeout: "The live GPT-5.6 Candidate request timed out.",
  refusal: "GPT-5.6 refused to generate a Candidate Sprout from the supplied evidence.",
  incomplete: "GPT-5.6 returned an incomplete Candidate Sprout response.",
  malformed_output:
    "GPT-5.6 returned output that did not satisfy the Candidate Sprout schema.",
  api_error: "The live GPT-5.6 Candidate request failed.",
};

export class CandidateExtractionError extends Error {
  readonly code: CandidateExtractionErrorCode;

  constructor(code: CandidateExtractionErrorCode, options?: ErrorOptions) {
    super(safeErrorMessages[code], options);
    this.name = "CandidateExtractionError";
    this.code = code;
  }
}

export interface CandidateTransportRequest {
  model: typeof candidateModel;
  systemPrompt: string;
  evidenceInput: string;
}

export interface CandidateTransport {
  parse(request: CandidateTransportRequest): Promise<unknown>;
}

const candidateApiResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    status: z.string().min(1),
    output_parsed: z.unknown().optional(),
    output: z.array(
      z
        .object({
          type: z.string(),
          content: z
            .array(
              z
                .object({
                  type: z.string(),
                  refusal: z.string().optional(),
                  parsed: z.unknown().optional(),
                })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

function createOpenAITransport(apiKey: string): CandidateTransport {
  const client = new OpenAI({
    apiKey,
    maxRetries: 1,
    timeout: candidateTimeoutMs,
  });

  return {
    async parse(request) {
      return client.responses.parse({
        model: request.model,
        instructions: request.systemPrompt,
        input: request.evidenceInput,
        store: false,
        text: {
          format: zodTextFormat(
            candidateSproutContentSchema,
            "candidate_sprout",
          ),
        },
      });
    },
  };
}

function extractParsedContent(response: z.infer<typeof candidateApiResponseSchema>) {
  if (response.output_parsed !== undefined && response.output_parsed !== null) {
    return response.output_parsed;
  }

  for (const output of response.output) {
    for (const content of output.content ?? []) {
      if (content.type === "refusal") {
        throw new CandidateExtractionError("refusal");
      }
      if (content.parsed !== undefined && content.parsed !== null) {
        return content.parsed;
      }
    }
  }

  return undefined;
}

function classifyTransportError(error: unknown): CandidateExtractionError {
  if (error instanceof CandidateExtractionError) {
    return error;
  }

  const errorRecord =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const status = errorRecord.status;
  const name = typeof errorRecord.name === "string" ? errorRecord.name : "";

  if (status === 401 || status === 403) {
    return new CandidateExtractionError("invalid_credentials", { cause: error });
  }
  if (name.includes("Timeout") || name === "AbortError") {
    return new CandidateExtractionError("timeout", { cause: error });
  }

  return new CandidateExtractionError("api_error", { cause: error });
}

function candidateEvidenceReferences(evidence: CandidateEvidenceBundle) {
  return {
    failedAgentRunId: evidence.failedAgentRun.id,
    humanCorrectionId: evidence.humanCorrection.id,
    correctedOutcomeId: evidence.correctedOutcome.id,
    deterministicEvidenceId: evidence.deterministicEvidence.id,
  };
}

export function assembleCandidateSprout(options: {
  content: CandidateSproutContent;
  evidence: CandidateEvidenceBundle;
  source: "live" | "seeded";
  modelReturned: string | null;
  responseId: string | null;
  generatedAt: string;
}): CandidateSprout {
  const evidence = candidateEvidenceBundleSchema.parse(options.evidence);
  const content = candidateSproutContentSchema.parse(options.content);
  const candidate = {
    ...content,
    id: createDeterministicId(idPrefixes.candidateSprout, {
      content,
      evidence: candidateEvidenceReferences(evidence),
      source: options.source,
      responseId: options.responseId,
    }),
    status: "candidate" as const,
    evidence: candidateEvidenceReferences(evidence),
    provenance: {
      source: options.source,
      promptVersion: candidatePromptVersion,
      modelRequested: candidateModel,
      modelReturned: options.modelReturned,
      responseId: options.responseId,
      generatedAt: options.generatedAt,
    },
  };

  return candidateSproutSchema.parse(candidate);
}

export async function extractLiveCandidate(options: {
  evidence: CandidateEvidenceBundle;
  apiKey?: string;
  transport?: CandidateTransport;
  now?: () => Date;
}): Promise<CandidateSprout> {
  const evidence = candidateEvidenceBundleSchema.parse(options.evidence);
  const apiKey = options.apiKey?.trim();

  if (!options.transport && !apiKey) {
    throw new CandidateExtractionError("missing_credentials");
  }

  const transport = options.transport ?? createOpenAITransport(apiKey as string);

  try {
    const rawResponse = await transport.parse({
      model: candidateModel,
      systemPrompt: candidateSystemPrompt,
      evidenceInput: buildCandidateEvidenceInput(evidence),
    });
    const response = candidateApiResponseSchema.parse(rawResponse);

    if (response.status !== "completed") {
      throw new CandidateExtractionError("incomplete");
    }

    const parsedContent = extractParsedContent(response);
    const contentResult = candidateSproutContentSchema.safeParse(parsedContent);
    if (!contentResult.success) {
      throw new CandidateExtractionError("malformed_output", {
        cause: contentResult.error,
      });
    }

    return assembleCandidateSprout({
      content: contentResult.data,
      evidence,
      source: "live",
      modelReturned: response.model,
      responseId: response.id,
      generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new CandidateExtractionError("malformed_output", { cause: error });
    }
    throw classifyTransportError(error);
  }
}

const seededEvidenceDirectory = join(
  process.cwd(),
  "demo",
  "generated-files",
  "evidence",
  "seeded",
);

async function readSeededJson(filename: string): Promise<unknown> {
  return JSON.parse(await readFile(join(seededEvidenceDirectory, filename), "utf8"));
}

export async function loadSeededEvidence(): Promise<CandidateEvidenceBundle> {
  const [failedAgentRun, humanCorrection, correctedOutcome, deterministicEvidence] =
    await Promise.all([
      readSeededJson("failed-run.json"),
      readSeededJson("human-correction.json"),
      readSeededJson("corrected-outcome.json"),
      readSeededJson("deterministic-evidence.json"),
    ]);

  return candidateEvidenceBundleSchema.parse({
    failedAgentRun,
    humanCorrection,
    correctedOutcome,
    deterministicEvidence,
  });
}

export function createSeededCandidate(
  evidence: CandidateEvidenceBundle,
): CandidateSprout {
  return assembleCandidateSprout({
    content: {
      title: "Generated files must not be edited directly",
      type: "Agent Experience",
      trigger:
        "A task requests a change to the generated API client under generated/**.",
      procedure: [
        "Modify the source schema in api/openapi.yaml.",
        "Run pnpm generate:api to regenerate generated/api-client.ts.",
        "Run the client tests and generated-files evidence oracle.",
      ],
      prohibitedActions: [
        "Do not edit generated/api-client.ts directly.",
      ],
      scope: {
        paths: [
          "api/openapi.yaml",
          "generated/**",
          "scripts/generate-client.ts",
        ],
      },
      uncertainties: [
        "Revalidate the generator command and schema location if project configuration changes.",
      ],
      recommendedArtifact: "ci_and_hook",
    },
    evidence,
    source: "seeded",
    modelReturned: null,
    responseId: null,
    generatedAt: "2026-07-18T09:05:00.000Z",
  });
}

export async function loadSeededCandidate(): Promise<CandidateSprout> {
  return candidateSproutSchema.parse(await readSeededJson("candidate.json"));
}
