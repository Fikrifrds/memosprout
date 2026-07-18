import { loadSeededCandidate } from "@/lib/openai/extract-candidate";
import {
  okfContentType,
  okfDownloadFilename,
  renderCandidateOkf,
} from "@/lib/okf/render";

export async function GET(): Promise<Response> {
  const markdown = renderCandidateOkf(await loadSeededCandidate());

  return new Response(markdown, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${okfDownloadFilename}"`,
      "Content-Type": okfContentType,
      "X-MemoSprout-Source": "seeded",
    },
  });
}
