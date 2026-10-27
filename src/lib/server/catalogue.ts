import "server-only";
import { PRODUCTS } from "@/domain/config/products";
import { resolveActiveConfig } from "@/domain/config/resolve";
import type { ProductDefinition } from "@/domain/types";
import type { ProductSummary, ProductView } from "@/lib/catalogue-types";

export function productView(product: ProductDefinition, now = new Date()): ProductView {
  const res = product.status === "BLOCKED" ? null : resolveActiveConfig(product, now);
  const c = res?.ok ? res.config : null;
  return {
    code: product.code,
    name: product.name,
    category: product.category,
    status: product.status,
    statusReason: product.statusReason,
    description: product.description,
    fields: product.fields,
    configError: res && !res.ok ? { code: res.errorCode, message: res.message } : null,
    activeConfig: c && {
      id: c.id,
      version: c.version,
      effectiveFrom: c.effectiveFrom,
      effectiveTo: c.effectiveTo,
      minimumPrincipal: c.minimumPrincipal,
      maximumPrincipal: c.maximumPrincipal,
      tenorUnit: c.tenorUnit,
      tenorMinimum: c.tenorMinimum,
      tenorMaximum: c.tenorMaximum,
      tenorOptions: c.tenorOptions,
      rateModel: c.rateModel,
      ratePercent: c.ratePercent,
      rateProvenance: c.rateProvenance,
      withholdingTaxPercent: c.tax?.withholdingTaxPercent,
      roundingPolicy: c.roundingPolicy,
      formulaVersion: c.formulaVersion,
      features: c.features,
      ruleNotes: c.ruleNotes,
      sources: c.sources,
      rtn: c.rtn && { rateGuideVersion: c.rtn.rateGuideVersion, bands: c.rtn.bands, rates: c.rtn.rates, corporateMinimum: c.rtn.corporateMinimum },
    },
  };
}

function tenorLabel(v: ProductView): string {
  const c = v.activeConfig;
  if (!c) return "—";
  const unit = c.tenorUnit === "DAY" ? "days" : "months";
  if (c.tenorOptions) return `${c.tenorOptions.join(", ")} ${unit}`;
  if (c.tenorMinimum !== undefined && c.tenorMaximum !== undefined) return `${c.tenorMinimum}–${c.tenorMaximum} ${unit}`;
  return "Unconfirmed";
}

function interestLabel(v: ProductView): string {
  const c = v.activeConfig;
  if (!c || !c.rateModel) return "No approved rate";
  switch (c.rateModel) {
    case "DAILY":
      return `${c.ratePercent}% per day, simple`;
    case "MONTHLY":
      return `${c.ratePercent}% per month, flat or reducing`;
    case "TIERED":
      return "Rate Guide by band × tenor × payout";
    default:
      return c.rateModel;
  }
}

export function productSummaries(now = new Date()): ProductSummary[] {
  return PRODUCTS.map((p) => {
    const v = productView(p, now);
    return {
      code: v.code,
      name: v.name,
      category: v.category,
      status: v.status,
      statusReason: v.statusReason,
      description: v.description,
      configError: v.configError,
      configVersionId: v.activeConfig?.id ?? null,
      minimumPrincipal: v.activeConfig?.minimumPrincipal ?? null,
      maximumPrincipal: v.activeConfig?.maximumPrincipal ?? null,
      tenorLabel: tenorLabel(v),
      interestLabel: interestLabel(v),
    };
  });
}
