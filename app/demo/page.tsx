import { DemoWizard } from "@/components/demo/DemoWizard";
import { SiteNav } from "@/components/SiteNav";
import { loadSeededCandidate } from "@/lib/openai/extract-candidate";

export const metadata = {
  title: "Demo — MemoSprout",
  description: "Walk the MemoSprout loop: a failed run becomes a validated sprout that improves a fresh agent.",
};

export default async function DemoPage() {
  const candidate = await loadSeededCandidate();
  return (
    <>
      <SiteNav />
      <DemoWizard candidate={candidate} />
    </>
  );
}
