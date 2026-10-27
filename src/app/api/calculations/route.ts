import { calculate, httpStatusFor } from "@/domain/calculate";
import { calculationRequestSchema } from "@/domain/inputs";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handler, json, readJson } from "@/lib/server/http";
import { logCalculation } from "@/lib/server/log";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/** POST /api/calculations — runs a calculation; never persists or moves money. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(req);
  rateLimit(`calc:${user.uid}`);

  const parsed = calculationRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "MALFORMED_REQUEST", "Request does not match the calculation schema.", parsed.error.issues);
  }
  const { productCode, inputs, qaOptions } = parsed.data;

  const started = performance.now();
  const result = calculate(productCode, inputs, qaOptions ?? {});
  logCalculation(result, performance.now() - started, user.uid);
  return json(result, httpStatusFor(result));
});
