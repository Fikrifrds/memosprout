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

export const getTaskContextInputSchema = z
  .object({
    filePaths: z.array(z.string().min(1)).min(1),
    task: z.string().optional(),
  })
  .strict();

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
  const matched = matchSprouts(registry, validated.filePaths);
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
    "Return validated MemoSprout guidance relevant to the files a task touches. " +
    "Call this before editing files so applicable, validated experience is applied.",
  inputSchema: {
    type: "object",
    properties: {
      filePaths: {
        type: "array",
        items: { type: "string" },
        description: "Repository-relative paths the task touches or intends to edit.",
      },
      task: {
        type: "string",
        description: "Optional short description of the task.",
      },
    },
    required: ["filePaths"],
    additionalProperties: false,
  },
} as const;
