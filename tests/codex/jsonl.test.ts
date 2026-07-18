import { describe, expect, it } from "vitest";

import {
  didCodexTurnComplete,
  getCodexFinalMessage,
  getCodexThreadId,
  parseCodexJsonl,
} from "@/lib/codex/jsonl";

describe("Codex JSONL parser", () => {
  it("parses a completed event stream", () => {
    const parsed = parseCodexJsonl(
      [
        JSON.stringify({ type: "thread.started", thread_id: "thread_1" }),
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: '{"version":"1"}' },
        }),
        JSON.stringify({ type: "turn.completed" }),
      ].join("\n"),
    );

    expect(getCodexThreadId(parsed.events)).toBe("thread_1");
    expect(getCodexFinalMessage(parsed.events)).toBe('{"version":"1"}');
    expect(didCodexTurnComplete(parsed.events)).toBe(true);
  });

  it("rejects malformed events", () => {
    expect(() => parseCodexJsonl('{"thread_id":"missing-type"}')).toThrow(
      "Invalid Codex JSONL event",
    );
  });

  it("retains an incomplete final line for failed streams", () => {
    const parsed = parseCodexJsonl(
      '{"type":"thread.started","thread_id":"thread_1"}\n{"type":',
      { allowPartial: true },
    );

    expect(parsed.events).toHaveLength(1);
    expect(parsed.incompleteLine).toBe('{"type":');
  });
});
