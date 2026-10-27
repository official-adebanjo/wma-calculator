import { ScenarioDetail } from "./scenario-detail";

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ScenarioDetail id={id} />;
}
