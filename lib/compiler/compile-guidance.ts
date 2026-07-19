import {
  candidateSproutContentSchema,
  type CandidateSproutContent,
} from "@/lib/domain/schemas";

export interface CompileGuidanceOptions {
  sproutId?: string;
}

function inline(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function compileSproutGuidance(
  input: CandidateSproutContent,
  options: CompileGuidanceOptions = {},
): string {
  const sprout = candidateSproutContentSchema.parse(input);
  const lines: string[] = [`# ${inline(sprout.title)}`, ""];

  if (options.sproutId) {
    lines.push(`Source Candidate Sprout: \`${options.sproutId}\``, "");
  }

  lines.push(inline(sprout.trigger), "", "Procedure:", "");
  sprout.procedure.forEach((step, index) => {
    lines.push(`${index + 1}. ${inline(step)}`);
  });

  lines.push("", "Do not:");
  sprout.prohibitedActions.forEach((action) => {
    lines.push(`- ${inline(action)}`);
  });

  return `${lines.join("\n")}\n`;
}
