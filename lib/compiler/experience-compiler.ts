import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  candidateSproutContentSchema,
  type CandidateSproutContent,
} from "@/lib/domain/schemas";

export const experiencePromptVersion = "experience-compiler-v1" as const;
export const experienceModel = "gpt-5.6-sol" as const;
export const experienceTimeoutMs = 90_000;

export const experienceEvidenceSchema = z
  .object({
    scenario: z.string().min(1),
    task: z.string().min(1),
    failedSummary: z.string().min(1),
    humanCorrection: z.string().min(1),
  })
  .strict();

export type ExperienceEvidence = z.infer<typeof experienceEvidenceSchema>;

export function buildExperienceSystemPrompt(scenario: string): string {
  return [
    "You are MemoSprout's Experience Compiler.",
    `Convert only the supplied evidence into one narrow Candidate Sprout for the "${scenario}" scenario.`,
    "Preserve uncertainty and do not invent files, commands, outcomes, or evidence.",
    "The procedure must tell an agent how to complete the task correctly.",
    "The prohibited action must reject the mistake the human corrected.",
    "Return only the required structured output.",
  ].join(" ");
}

export function buildExperienceInput(evidence: ExperienceEvidence): string {
  const validated = experienceEvidenceSchema.parse(evidence);
  return JSON.stringify(
    {
      scenario: validated.scenario,
      task: validated.task,
      failed_run_summary: validated.failedSummary,
      human_correction: validated.humanCorrection,
    },
    null,
    2,
  );
}

export type ExperienceErrorCode =
  | "missing_credentials"
  | "invalid_credentials"
  | "timeout"
  | "refusal"
  | "incomplete"
  | "malformed_output"
  | "api_error";

const safeErrorMessages: Record<ExperienceErrorCode, string> = {
  missing_credentials:
    "Live experience compilation requires an OPENAI_API_KEY environment variable.",
  invalid_credentials:
    "OpenAI rejected the configured credentials. Verify API access without exposing the key.",
  timeout: "The live experience compilation request timed out.",
  refusal: "The model refused to compile a Candidate Sprout from the supplied evidence.",
  incomplete: "The model returned an incomplete experience compilation response.",
  malformed_output:
    "The model returned output that did not satisfy the Candidate Sprout schema.",
  api_error: "The live experience compilation request failed.",
};

export class ExperienceCompilationError extends Error {
  readonly code: ExperienceErrorCode;

  constructor(code: ExperienceErrorCode, options?: ErrorOptions) {
    super(safeErrorMessages[code], options);
    this.name = "ExperienceCompilationError";
    this.code = code;
  }
}

export interface ExperienceTransportRequest {
  model: typeof experienceModel;
  systemPrompt: string;
  evidenceInput: string;
}

export interface ExperienceTransport {
  parse(request: ExperienceTransportRequest): Promise<unknown>;
}

const experienceApiResponseSchema = z
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

export interface ExperienceProvenance {
  modelReturned: string;
  responseId: string;
}

function createOpenAIExperienceTransport(apiKey: string): ExperienceTransport {
  const client = new OpenAI({
    apiKey,
    maxRetries: 1,
    timeout: experienceTimeoutMs,
  });
  return {
    async parse(request) {
      return client.responses.parse({
        model: request.model,
        instructions: request.systemPrompt,
        input: request.evidenceInput,
        store: false,
        text: {
          format: zodTextFormat(candidateSproutContentSchema, "candidate_sprout"),
        },
      });
    },
  };
}

function extractParsedContent(
  response: z.infer<typeof experienceApiResponseSchema>,
): unknown {
  if (response.output_parsed !== undefined && response.output_parsed !== null) {
    return response.output_parsed;
  }
  for (const output of response.output) {
    for (const content of output.content ?? []) {
      if (content.type === "refusal") {
        throw new ExperienceCompilationError("refusal");
      }
      if (content.parsed !== undefined && content.parsed !== null) {
        return content.parsed;
      }
    }
  }
  return undefined;
}

function classifyTransportError(error: unknown): ExperienceCompilationError {
  if (error instanceof ExperienceCompilationError) {
    return error;
  }
  const errorRecord =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const status = errorRecord.status;
  const name = typeof errorRecord.name === "string" ? errorRecord.name : "";
  if (status === 401 || status === 403) {
    return new ExperienceCompilationError("invalid_credentials", { cause: error });
  }
  if (name.includes("Timeout") || name === "AbortError") {
    return new ExperienceCompilationError("timeout", { cause: error });
  }
  return new ExperienceCompilationError("api_error", { cause: error });
}

export interface CompiledExperience {
  content: CandidateSproutContent;
  provenance: ExperienceProvenance | null;
}

export async function compileExperience(options: {
  evidence: ExperienceEvidence;
  apiKey?: string;
  transport?: ExperienceTransport;
}): Promise<CompiledExperience> {
  const evidence = experienceEvidenceSchema.parse(options.evidence);
  const apiKey = options.apiKey?.trim();

  if (!options.transport && !apiKey) {
    throw new ExperienceCompilationError("missing_credentials");
  }

  const transport = options.transport ?? createOpenAIExperienceTransport(apiKey as string);

  try {
    const rawResponse = await transport.parse({
      model: experienceModel,
      systemPrompt: buildExperienceSystemPrompt(evidence.scenario),
      evidenceInput: buildExperienceInput(evidence),
    });
    const response = experienceApiResponseSchema.parse(rawResponse);

    if (response.status !== "completed") {
      throw new ExperienceCompilationError("incomplete");
    }

    const parsedContent = extractParsedContent(response);
    const contentResult = candidateSproutContentSchema.safeParse(parsedContent);
    if (!contentResult.success) {
      throw new ExperienceCompilationError("malformed_output", { cause: contentResult.error });
    }

    return {
      content: contentResult.data,
      provenance: { modelReturned: response.model, responseId: response.id },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ExperienceCompilationError("malformed_output", { cause: error });
    }
    throw classifyTransportError(error);
  }
}
