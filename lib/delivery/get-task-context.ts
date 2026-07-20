import { z } from "zod";

import { type SproutRegistry, type ValidatedSprout } from "@/lib/delivery/registry";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function pathInScope(filePath: string, scopePath: string): boolean {
  const file = normalizePath(filePath);
  const scope = normalizePath(scopePath);
  return file === scope || file.startsWith(`${scope}/`) || scope.startsWith(`${file}/`);
}

export function matchSprouts(
  registry: SproutRegistry,
  filePaths: string[],
): ValidatedSprout[] {
  return registry
    .list()
    .filter((sprout) =>
      sprout.scopePaths.some((scopePath) =>
        filePaths.some((filePath) => pathInScope(filePath, scopePath)),
      ),
    );
}

export function contextMatches(
  required: Record<string, string>,
  provided: Record<string, string>,
): boolean {
  return Object.entries(required).every(([key, value]) => provided[key] === value);
}

export const getTaskContextInputSchema = z
  .object({
    filePaths: z.array(z.string().min(1)).optional(),
    context: z.record(z.string(), z.string()).optional(),
    task: z.string().optional(),
  })
  .strict()
  .refine(
    (input) =>
      (input.filePaths?.length ?? 0) > 0 || Object.keys(input.context ?? {}).length > 0,
    { message: "Provide at least one of filePaths or context." },
  );

export type GetTaskContextInput = z.infer<typeof getTaskContextInputSchema>;

export interface TaskContextSprout {
  sproutId: string;
  scenario: string;
  guidance: string;
}

export interface GetTaskContextResult {
  sprouts: TaskContextSprout[];
}

export function getTaskContext(
  registry: SproutRegistry,
  input: GetTaskContextInput,
): GetTaskContextResult {
  const validated = getTaskContextInputSchema.parse(input);
  const filePaths = validated.filePaths ?? [];
  const context = validated.context ?? {};
  const pathMatchedIds = new Set(matchSprouts(registry, filePaths).map((s) => s.sproutId));
  const matched = registry.list().filter(
    (sprout) =>
      pathMatchedIds.has(sprout.sproutId) ||
      (sprout.contextMatch !== undefined && contextMatches(sprout.contextMatch, context)),
  );
  return {
    sprouts: matched.map((sprout) => ({
      sproutId: sprout.sproutId,
      scenario: sprout.scenario,
      guidance: sprout.guidance,
    })),
  };
}

export const getTaskContextToolDefinition = {
  name: "get_task_context",
  description:
    "Return validated MemoSprout guidance relevant to a task. Match by the files the task " +
    "touches (filePaths) and/or by context attributes (context), such as ticket type or domain. " +
    "Call this before acting so applicable, validated experience is applied.",
  inputSchema: {
    type: "object",
    properties: {
      filePaths: {
        type: "array",
        items: { type: "string" },
        description: "Repository-relative paths the task touches or intends to edit.",
      },
      context: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Context attributes to match, for example { ticketType: \"refund\" }.",
      },
      task: {
        type: "string",
        description: "Optional short description of the task.",
      },
    },
    additionalProperties: false,
  },
} as const;
