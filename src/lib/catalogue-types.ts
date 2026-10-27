import type {
  FeatureToggle,
  InputFieldDef,
  ProductCategory,
  ProductStatus,
  RoundingPolicy,
  RtnBand,
  RtnRateCell,
  RuleNote,
  SourceReference,
} from "@/domain/types";

/** Product as exposed by GET /api/products/{code}. */
export interface ProductView {
  code: string;
  name: string;
  category: ProductCategory;
  status: ProductStatus;
  statusReason?: string;
  description: string;
  fields: InputFieldDef[];
  activeConfig: ActiveConfigView | null;
  configError: { code: string; message: string } | null;
}

export interface ActiveConfigView {
  id: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  minimumPrincipal: string | null;
  maximumPrincipal: string | null;
  tenorUnit: string;
  tenorMinimum?: number;
  tenorMaximum?: number;
  tenorOptions?: number[];
  rateModel: string | null;
  ratePercent?: string;
  rateProvenance?: string;
  withholdingTaxPercent?: string;
  roundingPolicy: RoundingPolicy;
  formulaVersion: string;
  features: Record<string, FeatureToggle>;
  ruleNotes: RuleNote[];
  sources: SourceReference[];
  rtn?: { rateGuideVersion: string; bands: RtnBand[]; rates: RtnRateCell[]; corporateMinimum: string };
}

export type ProductSummary = Omit<ProductView, "fields" | "activeConfig"> & {
  configVersionId: string | null;
  minimumPrincipal: string | null;
  maximumPrincipal: string | null;
  tenorLabel: string;
  interestLabel: string;
};
