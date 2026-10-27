import { getProduct } from "@/domain/config/products";
import { requireUser } from "@/lib/server/auth";
import { productView } from "@/lib/server/catalogue";
import { ApiError, handler, json } from "@/lib/server/http";

export const runtime = "nodejs";

/** GET /api/products/{productCode} — input constraints and active configuration. */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ productCode: string }> }) => {
  await requireUser(req);
  const { productCode } = await ctx.params;
  const product = getProduct(productCode.toUpperCase());
  if (!product) throw new ApiError(404, "UNKNOWN_PRODUCT", `Unknown product: ${productCode}`);
  return json({ product: productView(product) });
});
