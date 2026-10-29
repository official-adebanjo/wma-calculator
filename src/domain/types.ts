/**
 * Core domain types for the RFS calculator.
 *
 * The domain layer is pure: inputs + explicit configuration -> deterministic
 * result. Nothing in src/domain may import UI, Next.js, or Firebase code.
 */

export type ProductCategory = "LOAN" | "INVESTMENT";

/** Product availability for new calculation runs (spec 7.1). */
export type ProductStatus = "ACTIVE" | "VALIDATION_ONLY" | "BLOCKED" | "DEPRECATED";

/** Lifecycle of a single configuration version (spec 9). */
export type ConfigVersionStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "RETIRED";

export type CalculationStatus = "CALCULATED" | "VALIDATION_ONLY" | "BLOCKED" | "ERROR";

export type TenorUnit = "DAY" | "MONTH";

export type RateModel = "DAILY" | "MONTHLY" | "ANNUAL" | "TIERED";

export type InterestModel =
  | "DAILY_PRORATED"
  | "FLAT"
  | "REDUCING_BALANCE"
  | "RTN_MATURITY"
  | "RTN_UPFRONT"
  | "CUSTOM";

/**
 * How intermediate monetary values are rounded.
 * - COMPONENT: each displayed component is rounded (2dp, half-up) and later
 *   components are derived from the rounded values, so displayed lines reconcile.
 * - FINAL: full precision is carried through; values are rounded only for output.
 * The approved policy is still open (OPEN-RTN-02 / OPEN-LOAN-03), so both are supported.
 */
export type RoundingMode = "COMPONENT" | "FINAL";

export interface RoundingPolicy {
  mode: RoundingMode;
  scale: 2;
  rounding: "HALF_UP";
}

/** Status of an individual rule within a product configuration. */
export type RuleStatus = "CONFIRMED" | "PROVISIONAL" | "OPEN" | "NOT_SPECIFIED";

export interface RuleNote {
  id: string;
  status: RuleStatus;
  note: string;
}

export interface SourceReference {
  document: string;
  section: string;
}

/** Field definitions drive the dynamic input form (spec 7.2). */
export type InputFieldDef =
  | {
      kind: "money";
      name: string;
      label: string;
      required: boolean;
      min?: string;
      max?: string;
      help?: string;
    }
  | {
      kind: "integer";
      name: string;
      label: string;
      required: boolean;
      min?: number;
      max?: number;
      unit?: string;
      help?: string;
    }
  | {
      kind: "select";
      name: string;
      label: string;
      required: boolean;
      options: { value: string; label: string }[];
      help?: string;
    }
  | {
      kind: "percent";
      name: string;
      label: string;
      required: boolean;
      /** Inclusive bounds, percent units (e.g. "100" = 100%). */
      min?: string;
      max?: string;
      help?: string;
    }
  | {
      kind: "date";
      name: string;
      label: string;
      required: boolean;
      help?: string;
    };

export interface RtnRateCell {
  tenorDays: number;
  band: RtnBandCode;
  option: RtnPayoutOption;
  /** Annual percentage stored as a decimal string, e.g. "18.75" means 18.75% p.a. */
  annualRatePercent: string;
}

export type RtnBandCode = "A" | "B" | "C";
export type RtnPayoutOption = "MATURITY" | "UPFRONT";

export interface RtnBand {
  code: RtnBandCode;
  min: string;
  /** Inclusive upper bound; null means no upper bound. */
  max: string | null;
}

export interface PenaltyBand {
  /** Elapsed share of tenor, percent, inclusive bounds. */
  fromPercent: string;
  toPercent: string;
  /** Annual penalty rate percent. */
  penaltyRatePercent: string;
}

export interface FeatureToggle {
  enabled: boolean;
  ruleStatus: RuleStatus;
  note: string;
}

export interface ProductConfigVersion {
  id: string;
  productCode: string;
  version: string;
  status: ConfigVersionStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  minimumPrincipal: string | null;
  maximumPrincipal: string | null;
  tenorUnit: TenorUnit;
  tenorMinimum?: number;
  tenorMaximum?: number;
  tenorOptions?: number[];
  rateModel: RateModel | null;
  interestModel: InterestModel | null;
  /** Rate percent per rate unit, e.g. "0.30" (% per day) or "2" (% per month). */
  ratePercent?: string;
  /** Whether the configured rate is a confirmed production rate or an illustrative example. */
  rateProvenance?: "APPROVED" | "ILLUSTRATIVE";
  rtn?: {
    bands: RtnBand[];
    rateGuideVersion: string;
    rates: RtnRateCell[];
    corporateMinimum: string;
    dayCountBasis: 365;
    /** Legacy (RTN-1.0/1.1) penalty bands as fixed annual rates; kept for retired versions. */
    penaltyBands?: PenaltyBand[];
    /**
     * Approved early-withdrawal schedule (RTN-1.2+). Bands are checked in order;
     * the first whose upper bound (inclusive, % of tenor elapsed) is not
     * exceeded applies; a null bound means "before maturity". On or after the
     * maturity date the penalty is 0%. The penalty rate is shareOfRatePercent of
     * the placement's annual rate.
     */
    penaltySchedule?: { upToPercent: string | null; shareOfRatePercent: string }[];
    /** Days before maturity the customer is notified (T-n). */
    noticeDaysBeforeMaturity?: number;
    /**
     * Unconfirmed rounding reportedly used by the source app for upfront
     * placements (OPEN-9): upfront interest rounded UP to this multiple of ₦,
     * booked principal = funded − rounded interest. Shown for comparison only.
     */
    upfrontSourceRounding?: { interestRoundUpTo: string; note: string };
  };
  tax?: {
    withholdingTaxPercent: string;
  };
  /** RWIN open-ended plan: interest paid every payoutCycleDays; the first lockDays are locked. */
  rwin?: { dayCountBasis: 365; payoutCycleDays: number; lockDays: number };
  /**
   * Up-front loan deductions. Percentages are entered per calculation (they are
   * configured on the RFS Admin Portal); blank means not applied.
   */
  loanDeductions?: {
    managementFee: { field: string; basis: "PRINCIPAL" };
    withholdingTax: { field: string; basis: "INTEREST" };
  };
  /** Rate entered per calculation (percent field name) instead of a configured rate. */
  rateInputField?: string;
  /**
   * Pre-eligibility: the applicant's net monthly salary must be at least the
   * corridor's configured minimum (inclusive). Both are calculation inputs.
   */
  salaryEligibility?: { salaryField: string; minimumField: string };
  /** Eligibility cap: principal may not exceed this % of the stated monthly income (inclusive). */
  incomeCap?: {
    incomeField: string;
    maxPercentOfMonthlyIncome: string;
  };
  roundingPolicy: RoundingPolicy;
  features: Record<string, FeatureToggle>;
  formulaVersion: string;
  ruleNotes: RuleNote[];
  sources: SourceReference[];
  createdBy: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface ProductDefinition {
  code: string;
  name: string;
  category: ProductCategory;
  status: ProductStatus;
  description: string;
  /** Reason shown when status is not ACTIVE. */
  statusReason?: string;
  fields: InputFieldDef[];
  versions: ProductConfigVersion[];
}

export type LineItemType =
  | "PRINCIPAL"
  | "INTEREST"
  | "TAX"
  | "FEE"
  | "PENALTY"
  | "INSTALLMENT"
  | "PAYOUT"
  | "BALANCE";

export interface LineItem {
  sequence: number;
  label: string;
  amount: string;
  type: LineItemType;
  explanation: string;
}

export type SummaryValueKind = "money" | "percent" | "text" | "number";

export interface SummaryEntry {
  key: string;
  label: string;
  value: string;
  kind: SummaryValueKind;
  /** Highlighted as a headline figure in the UI. */
  emphasis?: boolean;
}

export interface CalculationStep {
  label: string;
  expression: string;
  result: string;
}

export interface ScheduleRow {
  period: number;
  dueDate: string | null;
  openingBalance: string;
  principal: string;
  interest: string;
  installment: string;
  closingBalance: string;
}

export type WarningSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface CalculationWarning {
  code: string;
  message: string;
  severity: WarningSeverity;
}

export interface FieldError {
  field: string;
  message: string;
}

/** A secondary analysis (early settlement / early withdrawal) attached to a result. */
export interface SecondaryAnalysis {
  key: string;
  title: string;
  status: CalculationStatus;
  ruleStatus: RuleStatus;
  message?: string;
  summary: SummaryEntry[];
  steps: CalculationStep[];
  lineItems: LineItem[];
}

export interface CalculationResult {
  calculationId: string;
  status: CalculationStatus;
  errorCode?: string;
  message?: string;
  productCode: string;
  productName: string;
  category: ProductCategory;
  configVersionId: string | null;
  configVersion: string | null;
  formulaVersion: string | null;
  /** ENTERED: a rate typed into the calculation (e.g. a corridor rate from the Admin Portal). */
  rateSource: "CONFIGURATION" | "ENTERED" | "QA_OVERRIDE" | "NONE";
  roundingMode: RoundingMode | null;
  calculatedAt: string;
  inputs: Record<string, unknown>;
  summary: SummaryEntry[];
  lineItems: LineItem[];
  steps: CalculationStep[];
  schedule: ScheduleRow[];
  /** Column headings when the schedule is not a repayment schedule (e.g. investment payouts). */
  scheduleLabels?: Partial<Record<"period" | "dueDate" | "principal" | "interest" | "installment", string>>;
  secondary: SecondaryAnalysis[];
  formula: string | null;
  assumptions: string[];
  warnings: CalculationWarning[];
  fieldErrors: FieldError[];
}
