import { DemoWizard } from "@/components/demo/DemoWizard";
import { loadSeededCandidate } from "@/lib/openai/extract-candidate";

export default async function Home() {
  const candidate = await loadSeededCandidate();
  return <DemoWizard candidate={candidate} />;
}
