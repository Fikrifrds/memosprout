import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadSeededCandidate } from "@/lib/openai/extract-candidate";
import {
  okfDownloadFilename,
  renderCandidateOkf,
} from "@/lib/okf/render";
import { parseAndValidateOkf } from "@/lib/okf/validate";

describe("OKF Markdown rendering", () => {
  it("renders required frontmatter and human-readable sections", async () => {
    const markdown = renderCandidateOkf(await loadSeededCandidate());
    const document = parseAndValidateOkf(markdown);

    expect(document.frontmatter.type).toBe("Agent Experience");
    expect(document.frontmatter.memosprout.source).toBe("seeded");
    expect(document.body).toContain("## Trigger");
    expect(document.body).toContain("## Validated Procedure");
    expect(document.body).toContain("## Prohibited Action");
    expect(document.body).toContain("## Scope");
    expect(document.body).toContain("## Evidence");
    expect(document.body).toContain("## Uncertainties");
  });

  it("matches the committed portable artifact byte-for-byte", async () => {
    const candidate = await loadSeededCandidate();
    const committed = await readFile(
      join(
        process.cwd(),
        "demo",
        "generated-files",
        "evidence",
        "seeded",
        okfDownloadFilename,
      ),
      "utf8",
    );

    expect(renderCandidateOkf(candidate)).toBe(committed);
  });

  it("uses injected provenance time deterministically", async () => {
    const candidate = await loadSeededCandidate();

    expect(renderCandidateOkf(candidate)).toBe(renderCandidateOkf(candidate));
    expect(renderCandidateOkf(candidate)).toContain(
      "created_at: 2026-07-18T09:05:00.000Z",
    );
  });

  it("contains no credentials or local machine paths", async () => {
    const markdown = renderCandidateOkf(await loadSeededCandidate());

    expect(markdown).not.toContain("OPENAI_API_KEY");
    expect(markdown).not.toContain("/Users/");
    expect(markdown).not.toContain("apiKey");
  });
});
