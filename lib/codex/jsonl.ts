import { z } from "zod";

export const codexEventSchema = z
  .object({
    type: z.string().min(1),
  })
  .passthrough();

export type CodexEvent = z.infer<typeof codexEventSchema>;

export interface ParsedCodexJsonl {
  events: CodexEvent[];
  incompleteLine: string | null;
}

export function parseCodexJsonl(
  input: string,
  options: { allowPartial?: boolean } = {},
): ParsedCodexJsonl {
  const lines = input.split("\n");
  const events: CodexEvent[] = [];
  let incompleteLine: string | null = null;

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    try {
      events.push(codexEventSchema.parse(JSON.parse(line)));
    } catch (error) {
      const isLastNonEmptyLine = lines.slice(index + 1).every((value) => !value.trim());
      if (options.allowPartial && isLastNonEmptyLine) {
        incompleteLine = rawLine;
        break;
      }
      throw new Error(`Invalid Codex JSONL event at line ${index + 1}.`, {
        cause: error,
      });
    }
  }

  return { events, incompleteLine };
}

export function getCodexThreadId(events: CodexEvent[]): string | null {
  for (const event of events) {
    if (event.type === "thread.started" && typeof event.thread_id === "string") {
      return event.thread_id;
    }
  }
  return null;
}

export function getCodexFinalMessage(events: CodexEvent[]): string | null {
  for (const event of [...events].reverse()) {
    if (event.type !== "item.completed" || typeof event.item !== "object" || event.item === null) {
      continue;
    }
    const item = event.item as Record<string, unknown>;
    if (item.type === "agent_message" && typeof item.text === "string") {
      return item.text;
    }
  }
  return null;
}

export function didCodexTurnComplete(events: CodexEvent[]): boolean {
  return events.some((event) => event.type === "turn.completed");
}
