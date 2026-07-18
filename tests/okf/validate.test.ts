import { describe, expect, it } from "vitest";

import { loadSeededCandidate } from "@/lib/openai/extract-candidate";
import {
  renderCandidateOkf,
  renderOkfDocument,
} from "@/lib/okf/render";
import { parseAndValidateOkf } from "@/lib/okf/validate";

describe("OKF validation", () => {
  it("preserves unknown extension metadata across parse and render", async () => {
    const markdown = renderCandidateOkf(await loadSeededCandidate(), {
      vendor_extension: { portable: true, revision: 7 },
    });
    const firstParse = parseAndValidateOkf(markdown);
    const renderedAgain = renderOkfDocument(firstParse);
    const secondParse = parseAndValidateOkf(renderedAgain);

    expect(secondParse.frontmatter.vendor_extension).toEqual({
      portable: true,
      revision: 7,
    });
  });

  it("rejects Markdown that omits a required OKF body section", async () => {
    const markdown = renderCandidateOkf(await loadSeededCandidate()).replace(
      "## Evidence",
      "## Supporting Material",
    );

    expect(() => parseAndValidateOkf(markdown)).toThrow(
      "OKF Markdown is missing required section: ## Evidence",
    );
  });

  it("prevents extension metadata from overriding required OKF fields", async () => {
    const markdown = renderCandidateOkf(await loadSeededCandidate(), {
      type: "Overridden Type",
    });

    expect(parseAndValidateOkf(markdown).frontmatter.type).toBe(
      "Agent Experience",
    );
  });
});
