import { calculate } from "@/domain/calculate";
import { compareResults } from "@/domain/compare";
import { qaOptionsSchema } from "@/domain/inputs";
import type { CalculationResult } from "@/domain/types";
import { compareRequestSchema } from "@/lib/scenario-types";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handler, json, readJson } from "@/lib/server/http";
import { getScenario } from "@/lib/server/scenarios";

export const runtime = "nodejs";

/** POST /api/scenarios/compare — accepts scenario IDs and/or fresh inputs. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(req);
  const parsed = compareRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "MALFORMED_REQUEST", parsed.error.issues[0]?.message ?? "Invalid compare request.", parsed.error.issues);

  const items: { label: string; result: CalculationResult }[] = [];
  for (const [i, item] of parsed.data.items.entries()) {
    if ("scenarioId" in item) {
      const s = await getScenario(user, item.scenarioId);
      items.push({ label: s.name, result: s.result });
    } else {
      const qa = qaOptionsSchema.safeParse(item.qaOptions ?? {});
      if (!qa.success) throw new ApiError(400, "MALFORMED_REQUEST", "Invalid QA options.", qa.error.issues);
      items.push({ label: item.label ?? `Scenario ${i + 1}`, result: calculate(item.productCode, item.inputs, qa.data) });
    }
  }
  return json({ comparison: compareResults(items) });
});
