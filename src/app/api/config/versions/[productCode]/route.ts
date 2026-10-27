import { getProduct } from "@/domain/config/products";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handler, json } from "@/lib/server/http";

export const runtime = "nodejs";

/** GET /api/config/versions/{productCode} — reviewer/admin view of all versions. */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ productCode: string }> }) => {
  await requireUser(req, ["REVIEWER", "ADMIN"]);
  const { productCode } = await ctx.params;
  const product = getProduct(productCode.toUpperCase());
  if (!product) throw new ApiError(404, "UNKNOWN_PRODUCT", `Unknown product: ${productCode}`);
  return json({ productCode: product.code, productStatus: product.status, versions: product.versions });
});
