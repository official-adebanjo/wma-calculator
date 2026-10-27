import type {
  ProductConfigVersion,
  ProductDefinition,
  RoundingPolicy,
  RtnRateCell,
} from "../types";

/**
 * Version-controlled product configuration (spec 7.6 MVP).
 *
 * Changes here must create a NEW version entry rather than editing an ACTIVE
 * one, so historical scenarios remain reproducible. Saved scenarios record the
 * configVersionId they were calculated with.
 */

const DEFAULT_ROUNDING: RoundingPolicy = { mode: "COMPONENT", scale: 2, rounding: "HALF_UP" };

const LOAN_SPEC = "LOAN PRODUCT SPECIFICATIONS.docx";
const ASSET_PRD = "RFS Unified App Asset Creation PRD.docx";
const INVEST_JOURNEYS = "Rosabon Unified App — Investment Customer Journeys.docx";
const QA_MATRIX = "Rosabon QA Calculation Matrix.xlsx";

const SEED_META = {
  createdBy: "seed:architecture-v1.0",
  approvedBy: null,
  createdAt: "2026-10-27T00:00:00.000Z",
} as const;

// ---------------------------------------------------------------------------
// RTN Rate Guide (QA matrix, "RTN Rate Guide" sheet). Annual % rates.
// ---------------------------------------------------------------------------
const RTN_RATE_TABLE: Record<number, [string, string, string, string, string, string]> = {
  //       A-upfront A-maturity B-upfront B-maturity C-upfront C-maturity
  60: ["13.89", "16.00", "15.19", "17.75", "16.62", "19.75"],
  90: ["14.89", "17.00", "16.19", "18.75", "17.62", "20.75"],
  120: ["15.64", "17.75", "17.19", "19.75", "18.37", "21.50"],
  180: ["16.39", "18.50", "17.94", "20.50", "19.12", "22.25"],
  365: ["17.14", "19.25", "18.69", "21.25", "19.87", "23.00"],
};

function buildRtnRates(): RtnRateCell[] {
  const cells: RtnRateCell[] = [];
  for (const [tenor, row] of Object.entries(RTN_RATE_TABLE)) {
    const [aU, aM, bU, bM, cU, cM] = row;
    const t = Number(tenor);
    cells.push(
      { tenorDays: t, band: "A", option: "UPFRONT", annualRatePercent: aU },
      { tenorDays: t, band: "A", option: "MATURITY", annualRatePercent: aM },
      { tenorDays: t, band: "B", option: "UPFRONT", annualRatePercent: bU },
      { tenorDays: t, band: "B", option: "MATURITY", annualRatePercent: bM },
      { tenorDays: t, band: "C", option: "UPFRONT", annualRatePercent: cU },
      { tenorDays: t, band: "C", option: "MATURITY", annualRatePercent: cM },
    );
  }
  return cells;
}

const nanoV1: ProductConfigVersion = {
  id: "NANO-1.0",
  productCode: "NANO",
  version: "1.0",
  status: "ACTIVE",
  effectiveFrom: "2026-10-27",
  effectiveTo: null,
  minimumPrincipal: "5000.00",
  maximumPrincipal: "50000.00",
  tenorUnit: "DAY",
  tenorMinimum: 1,
  tenorMaximum: 30,
  rateModel: "DAILY",
  interestModel: "DAILY_PRORATED",
  ratePercent: "0.30",
  rateProvenance: "ILLUSTRATIVE",
  roundingPolicy: DEFAULT_ROUNDING,
  features: {},
  formulaVersion: "NANO-F1",
  ruleNotes: [
    { id: "NANO-R1", status: "CONFIRMED", note: "Interest = Principal × daily rate × days; total = principal + interest." },
    { id: "NANO-R2", status: "OPEN", note: "0.30% per day is the worked-example rate; confirm the live configured rate (OPEN-LOAN-02)." },
    { id: "NANO-R3", status: "NOT_SPECIFIED", note: "No multi-installment schedule is defined; a single amount is due at maturity." },
    { id: "NANO-R4", status: "OPEN", note: "Due-date weekend/holiday handling and rounding convention (OPEN-LOAN-03)." },
  ],
  sources: [
    { document: LOAN_SPEC, section: "Nano Loan" },
    { document: QA_MATRIX, section: "LN-NANO-001..003" },
  ],
  ...SEED_META,
};

const paydayV1: ProductConfigVersion = {
  id: "PAYDAY-1.0",
  productCode: "PAYDAY",
  version: "1.0",
  status: "ACTIVE",
  effectiveFrom: "2026-10-27",
  effectiveTo: null,
  minimumPrincipal: "0.01",
  maximumPrincipal: "500000.00",
  tenorUnit: "DAY",
  tenorMinimum: 7,
  tenorMaximum: 30,
  rateModel: "DAILY",
  interestModel: "DAILY_PRORATED",
  ratePercent: "0.30",
  rateProvenance: "ILLUSTRATIVE",
  roundingPolicy: DEFAULT_ROUNDING,
  features: {
    earlySettlement: {
      enabled: true,
      ruleStatus: "PROVISIONAL",
      note: "Interest recalculated on actual days used, capped at the scheduled tenor. Exact day-count and rounding to be confirmed (LN-PAY-003). No early settlement fee is applied.",
    },
  },
  formulaVersion: "PAYDAY-F1",
  ruleNotes: [
    { id: "PAY-R1", status: "CONFIRMED", note: "Interest = Principal × daily rate × tenor days; total = principal + interest." },
    { id: "PAY-R2", status: "OPEN", note: "Maximum NGN 500,000 is subject to salary evaluation; eligibility is not modelled by this calculator." },
    { id: "PAY-R3", status: "OPEN", note: "0.30% per day is the worked-example rate; confirm the live configured rate (OPEN-LOAN-02)." },
  ],
  sources: [
    { document: LOAN_SPEC, section: "Payday Loan" },
    { document: QA_MATRIX, section: "LN-PAY-001..003" },
  ],
  ...SEED_META,
};

const personalPrivateV1: ProductConfigVersion = {
  id: "PERSONAL_PRIVATE-1.0",
  productCode: "PERSONAL_PRIVATE",
  version: "1.0",
  status: "ACTIVE",
  effectiveFrom: "2026-10-27",
  effectiveTo: null,
  minimumPrincipal: "0.01",
  maximumPrincipal: "30000000.00",
  tenorUnit: "MONTH",
  tenorMinimum: 3,
  tenorMaximum: 24,
  rateModel: "MONTHLY",
  interestModel: null, // selected per calculation: FLAT or REDUCING_BALANCE
  ratePercent: "2",
  rateProvenance: "ILLUSTRATIVE",
  roundingPolicy: DEFAULT_ROUNDING,
  features: {
    earlySettlement: {
      enabled: true,
      ruleStatus: "PROVISIONAL",
      note: "Payoff = remaining principal + current month's interest; future unearned interest waived, no penalty (LN-PER-003). Settlement-day accrual convention to be confirmed.",
    },
  },
  formulaVersion: "PERSONAL-F1",
  ruleNotes: [
    { id: "PER-R1", status: "CONFIRMED", note: "Flat: equal principal + (original principal × monthly rate) each month." },
    { id: "PER-R2", status: "CONFIRMED", note: "Reducing balance: equal principal + (opening balance × monthly rate); not an amortizing annuity." },
    { id: "PER-R3", status: "OPEN", note: "2% monthly is the worked-example rate; confirm the live configured rate (OPEN-LOAN-02)." },
    { id: "PER-R4", status: "OPEN", note: "Where principal does not divide evenly, the final installment absorbs the rounding remainder (rounding policy unconfirmed, LN-COM-001)." },
  ],
  sources: [
    { document: LOAN_SPEC, section: "Personal Loan — Private Sector" },
    { document: QA_MATRIX, section: "LN-PER-001..003" },
  ],
  ...SEED_META,
};

const rtnV1: ProductConfigVersion = {
  id: "RTN-1.0",
  productCode: "RTN",
  version: "1.0",
  status: "ACTIVE",
  effectiveFrom: "2026-10-27",
  effectiveTo: null,
  minimumPrincipal: "50000.00",
  maximumPrincipal: null,
  tenorUnit: "DAY",
  tenorOptions: [60, 90, 120, 180, 365],
  rateModel: "TIERED",
  interestModel: null, // RTN_MATURITY or RTN_UPFRONT per payout option
  rateProvenance: "APPROVED",
  rtn: {
    rateGuideVersion: "RTN-RG-QA-MATRIX-2026-10",
    bands: [
      { code: "A", min: "50000.00", max: "999999.99" },
      { code: "B", min: "1000000.00", max: "9999999.99" },
      { code: "C", min: "10000000.00", max: null },
    ],
    rates: buildRtnRates(),
    corporateMinimum: "250000.00",
    dayCountBasis: 365,
    penaltyBands: [
      { fromPercent: "0", toPercent: "25", penaltyRatePercent: "2.50" },
      { fromPercent: "26", toPercent: "50", penaltyRatePercent: "2.25" },
    ],
  },
  tax: { withholdingTaxPercent: "10" },
  roundingPolicy: DEFAULT_ROUNDING,
  features: {
    upfront: {
      enabled: true,
      ruleStatus: "PROVISIONAL",
      note: "Discounted booked-principal formula from the journey document. Formula confirmed; rounding/presentation unresolved (OPEN-9 / OPEN-RTN-02).",
    },
    earlyWithdrawal: {
      enabled: true,
      ruleStatus: "PROVISIONAL",
      note: "Formula and the 0–25% / 26–50% penalty bands are confirmed (RTN-EXIT-001). Gaps between bands and shares above 50% are undefined (OPEN-RTN-03) and are blocked. Upfront claw-back is Open (OPEN-RTN-04).",
    },
    topUp: {
      enabled: false,
      ruleStatus: "OPEN",
      note: "Top-up rate treatment is Proposed (OPEN-RTN-05). Disabled until approved.",
    },
    partialWithdrawal: {
      enabled: false,
      ruleStatus: "OPEN",
      note: "Partial withdrawal re-rating is not approved. Disabled.",
    },
  },
  formulaVersion: "RTN-F1",
  ruleNotes: [
    { id: "RTN-R1", status: "CONFIRMED", note: "Gross = P × annual rate × actual days / 365; WHT = 10% of gross; payout = P + net." },
    { id: "RTN-R2", status: "CONFIRMED", note: "Band boundaries inclusive: A ₦50,000–₦999,999.99; B ₦1,000,000–₦9,999,999.99; C ₦10,000,000+." },
    { id: "RTN-R3", status: "CONFIRMED", note: "Minimum ₦50,000 (individual), ₦250,000 (corporate), inclusive." },
    { id: "RTN-R4", status: "OPEN", note: "Confirm the current Admin Portal Rate Guide version/effective date before execution (OPEN-RTN-01)." },
    { id: "RTN-R5", status: "OPEN", note: "Weekend/public-holiday maturity handling (OPEN-RTN-07). Maturity date shown is the calendar date." },
    { id: "RTN-R6", status: "OPEN", note: "Default when no maturity instruction is given (OPEN-RTN-06)." },
  ],
  sources: [
    { document: INVEST_JOURNEYS, section: "RTN — Rate Guide, formula, WHT, penalty bands" },
    { document: QA_MATRIX, section: "RTN Test Matrix; RTN Rate Guide" },
  ],
  ...SEED_META,
};

const reapV1: ProductConfigVersion = {
  id: "REAP-0.1",
  productCode: "REAP",
  version: "0.1",
  status: "ACTIVE",
  effectiveFrom: "2026-10-27",
  effectiveTo: null,
  minimumPrincipal: "10000.00",
  maximumPrincipal: null,
  tenorUnit: "MONTH",
  rateModel: null,
  interestModel: null,
  roundingPolicy: DEFAULT_ROUNDING,
  features: {},
  formulaVersion: "REAP-VALIDATION-ONLY",
  ruleNotes: [
    { id: "REAP-R1", status: "CONFIRMED", note: "Minimum amount ₦10,000 (journey document)." },
    { id: "REAP-R2", status: "OPEN", note: "Approved rate table and formula by tenor, contribution frequency and plan type are missing (OPEN-REAP-01)." },
    { id: "REAP-R3", status: "OPEN", note: "Conflicting 20% and 30% rate values have been observed; neither is used (RR-002)." },
    { id: "REAP-R4", status: "OPEN", note: "Allowed tenor/target-date options are unconfirmed (RR-005)." },
  ],
  sources: [
    { document: INVEST_JOURNEYS, section: "REAP" },
    { document: QA_MATRIX, section: "REAP-RWIN Gaps RR-001..006" },
  ],
  ...SEED_META,
};

const rwinV1: ProductConfigVersion = {
  id: "RWIN-0.1",
  productCode: "RWIN",
  version: "0.1",
  status: "ACTIVE",
  effectiveFrom: "2026-10-27",
  effectiveTo: null,
  minimumPrincipal: "50000.00",
  maximumPrincipal: null,
  tenorUnit: "DAY",
  rateModel: null,
  interestModel: null,
  roundingPolicy: DEFAULT_ROUNDING,
  features: {},
  formulaVersion: "RWIN-VALIDATION-ONLY",
  ruleNotes: [
    { id: "RWIN-R1", status: "OPEN", note: "Minimum ₦50,000 per journey document; an earlier app note conflicts. Resolve before numerical acceptance testing." },
    { id: "RWIN-R2", status: "OPEN", note: "Rate table, cycle length, return formula, maturity and prize/reward rules are missing (OPEN-RWIN-01)." },
    { id: "RWIN-R3", status: "CONFIRMED", note: "RTN rates and formulas must not be reused for RWIN." },
  ],
  sources: [
    { document: INVEST_JOURNEYS, section: "RWIN" },
    { document: QA_MATRIX, section: "REAP-RWIN Gaps RW-001..005" },
  ],
  ...SEED_META,
};

const publicSectorDraft: ProductConfigVersion = {
  id: "PUBLIC_SECTOR-0.0",
  productCode: "PUBLIC_SECTOR",
  version: "0.0",
  status: "DRAFT",
  effectiveFrom: "2026-10-27",
  effectiveTo: null,
  minimumPrincipal: null,
  maximumPrincipal: null,
  tenorUnit: "MONTH",
  rateModel: null,
  interestModel: null,
  roundingPolicy: DEFAULT_ROUNDING,
  features: {},
  formulaVersion: "NONE",
  ruleNotes: [
    { id: "PUB-R1", status: "OPEN", note: "Public-sector rate, interest model, tenor schedule and installment convention not supplied (OPEN-LOAN-01)." },
    { id: "PUB-R2", status: "CONFIRMED", note: "Private-sector rules must not be reused by assumption." },
    { id: "PUB-R3", status: "OPEN", note: "The 4% monthly flat scenario in LN-PUB-001 is user-supplied, not an approved configuration." },
  ],
  sources: [
    { document: ASSET_PRD, section: "Loan products" },
    { document: QA_MATRIX, section: "LN-PUB-001..002" },
  ],
  ...SEED_META,
};

export const PRODUCTS: ProductDefinition[] = [
  {
    code: "NANO",
    name: "Nano Loan",
    category: "LOAN",
    status: "ACTIVE",
    description: "Short-term loan, NGN 5,000–50,000 for 1–30 days, simple daily interest.",
    fields: [
      { kind: "money", name: "principal", label: "Principal amount (₦)", required: true, min: "5000.00", max: "50000.00" },
      { kind: "integer", name: "tenorDays", label: "Tenor", required: true, min: 1, max: 30, unit: "days" },
      { kind: "date", name: "startDate", label: "Disbursement date", required: false, help: "Optional. Used to display the due date." },
    ],
    versions: [nanoV1],
  },
  {
    code: "PAYDAY",
    name: "Payday Loan",
    category: "LOAN",
    status: "ACTIVE",
    description: "Salary-backed loan up to NGN 500,000 for 7–30 days, simple daily interest.",
    fields: [
      { kind: "money", name: "principal", label: "Principal amount (₦)", required: true, min: "0.01", max: "500000.00" },
      { kind: "integer", name: "tenorDays", label: "Tenor", required: true, min: 7, max: 30, unit: "days" },
      { kind: "date", name: "startDate", label: "Disbursement date", required: false, help: "Optional. Used to display the due date." },
      {
        kind: "integer",
        name: "actualDaysUsed",
        label: "Early settlement: actual days used",
        required: false,
        min: 1,
        max: 30,
        unit: "days",
        help: "Optional, provisional. Must not exceed the tenor.",
      },
    ],
    versions: [paydayV1],
  },
  {
    code: "PERSONAL_PRIVATE",
    name: "Personal Loan — Private Sector",
    category: "LOAN",
    status: "ACTIVE",
    description: "Up to NGN 30,000,000 over 3–24 months; flat or reducing-balance monthly interest.",
    fields: [
      { kind: "money", name: "principal", label: "Principal amount (₦)", required: true, min: "0.01", max: "30000000.00" },
      { kind: "integer", name: "tenorMonths", label: "Tenor", required: true, min: 3, max: 24, unit: "months" },
      {
        kind: "select",
        name: "interestModel",
        label: "Interest model",
        required: true,
        options: [
          { value: "FLAT", label: "Monthly flat" },
          { value: "REDUCING_BALANCE", label: "Reducing balance (equal principal)" },
        ],
      },
      { kind: "date", name: "startDate", label: "Disbursement date", required: false, help: "Optional. Used to display installment due dates." },
      {
        kind: "integer",
        name: "settleAfterInstallments",
        label: "Early settlement: after installment #",
        required: false,
        min: 0,
        max: 23,
        help: "Optional, provisional. Number of installments already paid.",
      },
    ],
    versions: [personalPrivateV1],
  },
  {
    code: "PUBLIC_SECTOR",
    name: "Personal Loan — Public Sector",
    category: "LOAN",
    status: "BLOCKED",
    statusReason: "No approved public-sector rate, interest model or repayment convention has been supplied (OPEN-LOAN-01). Private-sector rules are not reused.",
    description: "Public-sector loan. Calculation unavailable until Product/Finance approves the rules.",
    fields: [
      { kind: "money", name: "principal", label: "Principal amount (₦)", required: true },
      { kind: "integer", name: "tenorMonths", label: "Tenor", required: true, min: 1, unit: "months" },
    ],
    versions: [publicSectorDraft],
  },
  {
    code: "RTN",
    name: "Rosabon Treasury Note (RTN)",
    category: "INVESTMENT",
    status: "ACTIVE",
    description: "Fixed-tenor note, 60–365 days. Rate depends on band, tenor and payout option. 10% WHT.",
    fields: [
      {
        kind: "select",
        name: "investorType",
        label: "Investor type",
        required: true,
        options: [
          { value: "INDIVIDUAL", label: "Individual (min ₦50,000)" },
          { value: "CORPORATE", label: "Corporate (min ₦250,000)" },
        ],
      },
      { kind: "money", name: "principal", label: "Funding amount (₦)", required: true, min: "50000.00" },
      {
        kind: "select",
        name: "tenorDays",
        label: "Tenor",
        required: true,
        options: [60, 90, 120, 180, 365].map((d) => ({ value: String(d), label: `${d} days` })),
      },
      {
        kind: "select",
        name: "payoutOption",
        label: "Interest payout",
        required: true,
        options: [
          { value: "MATURITY", label: "At maturity" },
          { value: "UPFRONT", label: "Upfront (provisional)" },
        ],
      },
      { kind: "date", name: "valueDate", label: "Value date", required: false, help: "Optional. Used to display the maturity date." },
      {
        kind: "integer",
        name: "daysElapsed",
        label: "Early withdrawal: days elapsed",
        required: false,
        min: 1,
        max: 364,
        unit: "days",
        help: "Optional, provisional. At-maturity placements only.",
      },
    ],
    versions: [rtnV1],
  },
  {
    code: "REAP",
    name: "REAP",
    category: "INVESTMENT",
    status: "VALIDATION_ONLY",
    statusReason: "Approved REAP rate table and return formula are missing (OPEN-REAP-01). Inputs are validated; no return is projected.",
    description: "Goal-based savings plan. Validation only until rates and formula are approved.",
    fields: [
      { kind: "money", name: "principal", label: "Amount (₦)", required: true, min: "10000.00" },
      {
        kind: "select",
        name: "planType",
        label: "Plan type",
        required: true,
        options: [
          { value: "LOCKED", label: "Locked" },
          { value: "OPEN", label: "Open" },
        ],
      },
      { kind: "integer", name: "tenorMonths", label: "Tenor (unconfirmed options)", required: false, min: 1, max: 120, unit: "months" },
    ],
    versions: [reapV1],
  },
  {
    code: "RWIN",
    name: "RWIN",
    category: "INVESTMENT",
    status: "VALIDATION_ONLY",
    statusReason: "Approved RWIN rate table, cycle length and return formula are missing (OPEN-RWIN-01). Inputs are validated; no return is projected.",
    description: "Cycle-based investment. Validation only until rates and rules are approved.",
    fields: [
      { kind: "money", name: "principal", label: "Amount (₦)", required: true, min: "50000.00" },
      { kind: "integer", name: "cycleDays", label: "Cycle (unconfirmed options)", required: false, min: 1, max: 3650, unit: "days" },
    ],
    versions: [rwinV1],
  },
];

export function getProduct(code: string): ProductDefinition | undefined {
  return PRODUCTS.find((p) => p.code === code);
}
