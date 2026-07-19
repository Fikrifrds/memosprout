import type { ValidatedSprout } from "@/lib/delivery/registry";

export interface DeliveryAdapter {
  readonly id: string;
  readonly targetFile: string;
  render(sprouts: ValidatedSprout[]): string;
}

function renderSections(sprouts: ValidatedSprout[], header: (sprout: ValidatedSprout) => string): string {
  return sprouts
    .map((sprout) => `${header(sprout)}\n\n${sprout.guidance.trim()}`)
    .join("\n\n---\n\n");
}

export class AgentsMdAdapter implements DeliveryAdapter {
  readonly id = "agents-md";
  readonly targetFile = "AGENTS.md";

  render(sprouts: ValidatedSprout[]): string {
    if (sprouts.length === 0) return "";
    const body = renderSections(
      sprouts,
      (sprout) => `## MemoSprout: ${sprout.scenario} (${sprout.sproutId})`,
    );
    return `${body}\n`;
  }
}

export class ClaudeCodeAdapter implements DeliveryAdapter {
  readonly id = "claude-code";
  readonly targetFile = "CLAUDE.md";

  render(sprouts: ValidatedSprout[]): string {
    if (sprouts.length === 0) return "";
    const preamble =
      "# MemoSprout validated guidance\n\n" +
      "Apply the following validated experience to the files in scope.\n";
    const body = renderSections(
      sprouts,
      (sprout) => `## ${sprout.scenario} (${sprout.sproutId})`,
    );
    return `${preamble}\n${body}\n`;
  }
}

export const deliveryAdapters: Record<string, DeliveryAdapter> = {
  "agents-md": new AgentsMdAdapter(),
  "claude-code": new ClaudeCodeAdapter(),
};
