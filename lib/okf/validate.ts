import { parse } from "yaml";
import { z } from "zod";

import type { OkfDocument } from "@/lib/okf/render";

const requiredBodyHeadings = [
  "## Trigger",
  "## Validated Procedure",
  "## Prohibited Action",
  "## Scope",
  "## Evidence",
  "## Uncertainties",
] as const;

export const okfFrontmatterSchema = z
  .object({
    type: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    memosprout: z
      .object({
        sprout_id: z.string().min(1),
        status: z.literal("candidate"),
        source: z.enum(["live", "seeded"]),
        prompt_version: z.string().min(1),
        model_requested: z.string().min(1),
        model_returned: z.string().min(1).nullable(),
        response_id: z.string().min(1).nullable(),
        evidence_ids: z.record(z.string(), z.string().min(1)),
      })
      .catchall(z.unknown()),
  })
  .catchall(z.unknown());

export type OkfFrontmatter = z.infer<typeof okfFrontmatterSchema>;

export interface ValidatedOkfDocument extends OkfDocument {
  frontmatter: OkfFrontmatter;
}

export function parseAndValidateOkf(markdown: string): ValidatedOkfDocument {
  const match = /^---\n([\s\S]*?)\n---\n\n([\s\S]+)$/.exec(markdown);
  if (!match) {
    throw new Error("OKF Markdown must contain YAML frontmatter and a body.");
  }

  const frontmatter = okfFrontmatterSchema.parse(parse(match[1]));
  const body = match[2].trim();

  for (const heading of requiredBodyHeadings) {
    if (!body.includes(heading)) {
      throw new Error(`OKF Markdown is missing required section: ${heading}`);
    }
  }

  return { frontmatter, body };
}
