// Rates are internal: this module must never be bundled into client code.
import "server-only";
import type {
  InputFieldDef,
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
const INVEST_DEDUCED = "Rosabon Investment Deduced Calculation Rules.docx";

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

// 1.1 adds the income-based eligibility cap. 1.0 is retired (never edited in
// place) so scenarios saved under it remain reproducible from their snapshot.
const paydayV1Retired: ProductConfigVersion = { ...paydayV1, status: "RETIRED", effectiveTo: "2026-10-27" };

const paydayV1_1: ProductConfigVersion = {
  ...paydayV1,
  id: "PAYDAY-1.1",
  version: "1.1",
  status: "ACTIVE",
  effectiveFrom: "2026-10-27",
  effectiveTo: null,
  incomeCap: { incomeField: "monthlyIncome", maxPercentOfMonthlyIncome: "50" },
  formulaVersion: "PAYDAY-F2",
  ruleNotes: [
    paydayV1.ruleNotes[0],
    {
      id: "PAY-R4",
      status: "CONFIRMED",
      note: "Eligible principal is capped at 50% of the registered monthly income (inclusive), and never above the ₦500,000 product maximum.",
    },
    {
      id: "PAY-R2",
      status: "OPEN",
      note: "Other salary-evaluation criteria (employer, payroll verification, existing obligations) are not modelled by this calculator.",
    },
    paydayV1.ruleNotes[2],
  ],
  sources: [...paydayV1.sources, { document: "RFS product rule (QA request)", section: "Payday income cap — 2026-10-27" }],
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
    { id: "PUB-R2", status: "CONFIRMED", note: "Personal Loan rules must not be reused by assumption." },
    { id: "PUB-R3", status: "OPEN", note: "The 4% monthly flat scenario in LN-PUB-001 is user-supplied, not an approved configuration." },
  ],
  sources: [
    { document: ASSET_PRD, section: "Loan products" },
    { document: QA_MATRIX, section: "LN-PUB-001..002" },
  ],
  ...SEED_META,
};

// ---------------------------------------------------------------------------
// 2026-10-28: optional up-front loan deductions (management fee on principal,
// WHT on interest), deducted from the amount disbursed. Each affected version
// is superseded by a new one; the previous version is retired, not edited.
// ---------------------------------------------------------------------------
const LOAN_DEDUCTIONS: NonNullable<ProductConfigVersion["loanDeductions"]> = {
  managementFee: { field: "managementFeePercent", basis: "PRINCIPAL" },
  withholdingTax: { field: "withholdingTaxPercent", basis: "INTEREST" },
};

const LOAN_DEDUCTION_FIELDS: InputFieldDef[] = [
  {
    kind: "percent",
    name: "managementFeePercent",
    label: "Management fee",
    required: false,
    max: "100",
    help: "Optional. % of principal, deducted at disbursement (e.g. 1). Use the Admin Portal value.",
  },
  {
    kind: "percent",
    name: "withholdingTaxPercent",
    label: "Withholding tax",
    required: false,
    max: "100",
    help: "Optional. % of total interest, deducted at disbursement. Use the Admin Portal value.",
  },
];

function withLoanDeductions(prev: ProductConfigVersion, version: string, formulaVersion: string): [ProductConfigVersion, ProductConfigVersion] {
  const effective = "2026-10-28";
  return [
    { ...prev, status: "RETIRED", effectiveTo: effective },
    {
      ...prev,
      id: `${prev.productCode}-${version}`,
      version,
      status: "ACTIVE",
      effectiveFrom: effective,
      effectiveTo: null,
      loanDeductions: LOAN_DEDUCTIONS,
      formulaVersion,
      ruleNotes: [
        ...prev.ruleNotes,
        {
          id: `${prev.productCode}-DED`,
          status: "CONFIRMED",
          note: "Management fee (% of principal) and withholding tax (% of interest) are deducted from the amount disbursed. Rates are set on the RFS Admin Portal and entered per calculation; blank means not applied.",
        },
      ],
      sources: [...prev.sources, { document: "RFS product rule (QA request)", section: "Loan deductions — 2026-10-28" }],
    },
  ];
}

const [nanoV1Retired, nanoV1_1] = withLoanDeductions(nanoV1, "1.1", "NANO-F2");
const [paydayV1_1Retired, paydayV1_2] = withLoanDeductions(paydayV1_1, "1.2", "PAYDAY-F3");
const [personalV1Retired, personalV1_1] = withLoanDeductions(personalPrivateV1, "1.1", "PERSONAL-F2");

// 2026-10-28: there is a single Personal Loan product (no private/public-sector
// split); the repayment plan is chosen per calculation. Earlier
// PERSONAL_PRIVATE-* versions stay in its history for saved scenarios.
const PLAN_NOTES: Record<string, string> = {
  "PER-R1": "Equal monthly repayment: equal principal + (original principal × monthly rate) each month, so every installment is the same.",
  "PER-R2": "Declining repayment: equal principal + (opening balance × monthly rate); installments fall each month. Not an amortizing annuity.",
};
const personalV1_1Retired: ProductConfigVersion = { ...personalV1_1, status: "RETIRED", effectiveTo: "2026-10-28" };
// 2026-10-28: Public Sector Loan uses the Personal Loan calculation (equal or
// declining repayment, fee/WHT deductions, early-settlement preview) with an
// interest rate entered per calculation (set per corridor) and a net-salary
// pre-eligibility check. MDA/corridor selection is configured elsewhere.
const publicSectorDraftRetired: ProductConfigVersion = { ...publicSectorDraft, status: "RETIRED", effectiveTo: "2026-10-28" };

const personalV1_2: ProductConfigVersion = {
  ...personalV1_1,
  id: "PERSONAL-1.2",
  productCode: "PERSONAL",
  version: "1.2",
  effectiveFrom: "2026-10-28",
  effectiveTo: null,
  ruleNotes: personalV1_1.ruleNotes.map((n) => (PLAN_NOTES[n.id] ? { ...n, note: PLAN_NOTES[n.id] } : n)),
  sources: [...personalV1_1.sources, { document: "RFS product rule (QA request)", section: "Single Personal Loan product — 2026-10-28" }],
};

// ---------------------------------------------------------------------------
// 2026-10-28: investment rules reviewed against "Rosabon Investment Deduced
// Calculation Rules". Formulas and the Rate Guide are unchanged (they match);
// the new versions record the document's open points and naming.
// ---------------------------------------------------------------------------
const INVEST_EFFECTIVE = "2026-10-28";
const DEDUCED_SOURCE = (section: string) => ({ document: INVEST_DEDUCED, section });

const rtnV1Retired: ProductConfigVersion = { ...rtnV1, status: "RETIRED", effectiveTo: INVEST_EFFECTIVE };
const rtnV1_1: ProductConfigVersion = {
  ...rtnV1,
  id: "RTN-1.1",
  version: "1.1",
  effectiveFrom: INVEST_EFFECTIVE,
  effectiveTo: null,
  formulaVersion: "RTN-F2",
  rtn: {
    ...rtnV1.rtn!,
    upfrontSourceRounding: {
      interestRoundUpTo: "10",
      note: "Source RTN logic reportedly rounds the ₦1,000,000 / 90-day example to ₦34,690 upfront interest and ₦965,310 booked principal (interest rounded up to the next ₦10). Inferred from one example; OPEN-9 is unresolved.",
    },
  },
  features: {
    ...rtnV1.features,
    upfront: {
      ...rtnV1.features.upfront,
      note: "Discounted booked-principal formula from the journey document. The recalculated figures (₦34,682.41 / ₦965,317.59 for ₦1m, 90 days) and the source app's rounded figures (₦34,690 / ₦965,310) disagree (OPEN-9); neither is the approved expected result.",
    },
    earlyWithdrawal: {
      ...rtnV1.features.earlyWithdrawal,
      note: "Penalty varies with elapsed tenor. The 0–25% / 26–50% bands come from the QA matrix (RTN-EXIT-001); the deduced rules document says exact boundaries and calculation details still require confirmation. Gaps and shares above 50% are blocked (OPEN-RTN-03). Upfront claw-back is Open (OPEN-RTN-04).",
    },
    topUp: {
      ...rtnV1.features.topUp,
      note: "A top-up may change the band; whether the new rate applies to the full balance or only the added amount is unconfirmed (OPEN-RTN-05). Disabled until approved.",
    },
    rollover: {
      enabled: false,
      ruleStatus: "OPEN",
      note: "Rollover uses the Rate Guide in force on the rollover date; rollover principal, interest treatment and date edge cases are unconfirmed. Disabled.",
    },
  },
  ruleNotes: [
    ...rtnV1.ruleNotes,
    { id: "RTN-R7", status: "OPEN", note: "10% WHT on interest is source-stated; Finance/Compliance must confirm the applicable tax treatment for each payment scenario." },
    { id: "RTN-R8", status: "OPEN", note: "Day counting is unconfirmed: actual tenor days / 365 is used, including in leap years; weekend, public-holiday and maturity-date handling are undefined." },
    { id: "RTN-R9", status: "CONFIRMED", note: "A band × tenor × payout combination without a published rate must not be selectable or calculable." },
  ],
  sources: [...rtnV1.sources, DEDUCED_SOURCE("2. RTN — Rosabon Treasury Note")],
};

// 2026-10-28: RFS approved answers to the open RTN questions (rates, bands,
// rounding, OPEN-9, WHT, early/partial withdrawal, top-up, rollover, dates).
const RTN_DECISIONS = { document: "RFS RTN product decisions (approved answers)", section: "A–D, 2026-10-28" };
const rtnV1_1Retired: ProductConfigVersion = { ...rtnV1_1, status: "RETIRED", effectiveTo: INVEST_EFFECTIVE };
const rtnV1_2: ProductConfigVersion = {
  ...rtnV1_1,
  id: "RTN-1.2",
  version: "1.2",
  effectiveFrom: INVEST_EFFECTIVE,
  effectiveTo: null,
  formulaVersion: "RTN-F3",
  // "Calculate at full precision": round only the figures that are output.
  roundingPolicy: { mode: "FINAL", scale: 2, rounding: "HALF_UP" },
  rtn: {
    rateGuideVersion: rtnV1_1.rtn!.rateGuideVersion,
    bands: rtnV1_1.rtn!.bands,
    rates: rtnV1_1.rtn!.rates,
    corporateMinimum: rtnV1_1.rtn!.corporateMinimum,
    dayCountBasis: 365,
    penaltySchedule: [
      { upToPercent: "25", shareOfRatePercent: "100" },
      { upToPercent: "50", shareOfRatePercent: "80" },
      { upToPercent: "75", shareOfRatePercent: "60" },
      { upToPercent: null, shareOfRatePercent: "40" },
    ],
    noticeDaysBeforeMaturity: 7,
  },
  features: {
    upfront: {
      enabled: true,
      ruleStatus: "CONFIRMED",
      note: "Divisor = 1 + (0.90 × rate × tenor ÷ 365); booked principal = funded ÷ divisor; upfront interest = funded − booked principal (net of 10% WHT, taken before payment). ₦1,000,000 at 16.19% for 90 days: gross ₦38,536.01, WHT ₦3,853.60, paid ₦34,682.41 (OPEN-9 resolved).",
    },
    earlyWithdrawal: {
      enabled: true,
      ruleStatus: "CONFIRMED",
      note: "Penal charge = days elapsed ÷ 365 × penalty rate × amount withdrawn, taken from accrued interest; 10% WHT on the remainder. Penalty rate by tenor elapsed: ≤25% → 100%, >25–50% → 80%, >50–75% → 60%, >75% before maturity → 40%, on/after maturity → 0% (of the placement rate). At-maturity placements only; upfront claw-back is still Open.",
    },
    partialWithdrawal: {
      enabled: true,
      ruleStatus: "CONFIRMED",
      note: "The withdrawn amount is its own early liquidation (interest, penalty, WHT on that amount only). The remainder must stay at or above the product minimum and is re-rated at its new band, same tenor and interest option; a new certificate is issued.",
    },
    topUp: {
      enabled: true,
      ruleStatus: "CONFIRMED",
      note: "Not a separate placement: the band is set by the new total principal, the extra money earns only for the days left, and the maturity date is unchanged.",
    },
    rollover: {
      enabled: true,
      ruleStatus: "CONFIRMED",
      note: "Principal plus net interest rolls over at the Rate Guide in force on the rollover date (from the effective date forward). The new placement starts on the calendar maturity date, so no day of interest is lost.",
    },
  },
  ruleNotes: [
    { id: "RTN-R1", status: "CONFIRMED", note: "At maturity: gross = principal × rate × tenor ÷ 365; net = gross × 0.90 (10% WHT); payout = principal + net." },
    { id: "RTN-R2", status: "CONFIRMED", note: "Bands are closed ranges at kobo precision: ₦999,999.99 is Band A; ₦1,000,000.00 and ₦9,999,999.99 are Band B; ₦10,000,000.00 is Band C. Amounts are held at 2 decimals." },
    { id: "RTN-R3", status: "CONFIRMED", note: "Minimum ₦50,000 (individual), ₦250,000 (corporate), inclusive." },
    { id: "RTN-R4", status: "CONFIRMED", note: "The Rate Guide is the approved production rate table." },
    { id: "RTN-R10", status: "CONFIRMED", note: "Band basis: confirmed principal at booking; new total principal after a top-up; remaining principal after a partial withdrawal; full amount received on an overpayment." },
    { id: "RTN-R11", status: "CONFIRMED", note: "The rate is locked on the funds-confirmed date. A saved quote is not binding; if rates change before funds are confirmed, the new rate applies. This calculator uses the current Rate Guide." },
    { id: "RTN-R8", status: "CONFIRMED", note: "Fixed 365-day basis, including leap years. Maturity date = start (funds-confirmed) date + tenor days." },
    { id: "RTN-R12", status: "CONFIRMED", note: "Calculated at full precision; only output figures are rounded (2 dp, half-up)." },
    { id: "RTN-R7", status: "CONFIRMED", note: "10% WHT applies to all interest paid to customers (individual or corporate): at maturity, upfront (inside the divisor), and on full or partial early withdrawal after the penalty." },
    { id: "RTN-R5", status: "CONFIRMED", note: "Interest runs to the calendar maturity date; payment goes out the next business day; the customer is notified at T-7. Weekend requests in desk-approved tiers queue to the next business day. Public holidays are not modelled here." },
    { id: "RTN-R9", status: "CONFIRMED", note: "A band × tenor × payout combination without a published rate must not be selectable or calculable." },
    { id: "RTN-R13", status: "OPEN", note: "Early withdrawal of an upfront-interest placement (claw-back of unearned upfront interest) is not yet specified (OPEN-RTN-04)." },
    { id: "RTN-R14", status: "OPEN", note: "Re-rating the remainder after a partial withdrawal: applied from the withdrawal day (original rate before, new band rate after), by analogy with top-ups. Confirm." },
  ],
  sources: [...rtnV1_1.sources, RTN_DECISIONS],
};

// 2026-10-29: RFS answer to RTN-R13 (early withdrawal of an upfront placement).
// Effective with the other approved RTN decisions so earlier quotes resolve to the same rules.
const RTN_UPFRONT_EXIT = INVEST_EFFECTIVE;
const rtnV1_2Retired: ProductConfigVersion = { ...rtnV1_2, status: "RETIRED", effectiveTo: RTN_UPFRONT_EXIT };
const rtnV1_3: ProductConfigVersion = {
  ...rtnV1_2,
  id: "RTN-1.3",
  version: "1.3",
  effectiveFrom: RTN_UPFRONT_EXIT,
  effectiveTo: null,
  formulaVersion: "RTN-F4",
  features: {
    ...rtnV1_2.features,
    earlyWithdrawal: {
      ...rtnV1_2.features.earlyWithdrawal,
      note: "Penal charge = days elapsed ÷ 365 × penalty rate × amount withdrawn, taken from accrued interest; 10% WHT on the remainder. Penalty rate by tenor elapsed: ≤25% → 100%, >25–50% → 80%, >50–75% → 60%, >75% before maturity → 40%, on/after maturity → 0% (of the placement rate).",
    },
    upfrontEarlyWithdrawal: {
      enabled: true,
      ruleStatus: "CONFIRMED",
      note: "Upfront placements are booked at the discounted principal (funded ÷ divisor). On early withdrawal: payout = booked principal + 0.90 × (interest accrued on booked principal − penal charge), with the penal charge on the booked principal at the same penalty schedule. Full withdrawal only.",
    },
  },
  ruleNotes: rtnV1_2.ruleNotes.map((n) =>
    n.id === "RTN-R13"
      ? { id: "RTN-R13", status: "CONFIRMED", note: "Upfront early withdrawal: payout = booked principal + 0.90 × (interest accrued on booked principal − penal charge). Booked principal = funded amount ÷ (1 + 0.90 × upfront rate ÷ 365 × tenor)." }
      : n,
  ),
  sources: [...rtnV1_2.sources, { document: "RFS RTN product decisions", section: "Upfront early withdrawal (RTN-R13), 2026-10-29" }],
};

const reapV1Retired: ProductConfigVersion = { ...reapV1, status: "RETIRED", effectiveTo: INVEST_EFFECTIVE };
const reapV0_2: ProductConfigVersion = {
  ...reapV1,
  id: "REAP-0.2",
  version: "0.2",
  effectiveFrom: INVEST_EFFECTIVE,
  effectiveTo: null,
  ruleNotes: [
    { id: "REAP-R1", status: "CONFIRMED", note: "Minimum investment ₦10,000." },
    { id: "REAP-R5", status: "CONFIRMED", note: "Goal-based plan: target amount/date, contribution details and OPEN/LOCKED plan states." },
    { id: "REAP-R2", status: "OPEN", note: "No approved rate table or return formula: rate selection, accrual basis, contribution timing, compounding, tax, maturity payout, withdrawal adjustment and penalties are all unconfirmed (OPEN-REAP-01)." },
    { id: "REAP-R3", status: "OPEN", note: "Conflicting 20% and 30% rate values have been observed; neither is used (RR-002)." },
  ],
  sources: [...reapV1.sources, DEDUCED_SOURCE("3. REAP — Rosabon Easy Access Plan")],
};

const rwinV1Retired: ProductConfigVersion = { ...rwinV1, status: "RETIRED", effectiveTo: INVEST_EFFECTIVE };
const rwinV0_2: ProductConfigVersion = {
  ...rwinV1,
  id: "RWIN-0.2",
  version: "0.2",
  effectiveFrom: INVEST_EFFECTIVE,
  effectiveTo: null,
  ruleNotes: [
    { id: "RWIN-R1", status: "OPEN", note: "Minimum ₦50,000 per the journey document; an earlier QA reference states ₦20,000. ₦50,000 is applied until Product confirms." },
    { id: "RWIN-R2", status: "OPEN", note: "No approved rate table or formula: rate selection, cycle length, accrual timing, WHT, early exit, maturity payout, rollover and reward/prize rules are unresolved (OPEN-RWIN-01)." },
    { id: "RWIN-R3", status: "CONFIRMED", note: "RTN rates and formulas must not be reused for RWIN." },
  ],
  sources: [...rwinV1.sources, DEDUCED_SOURCE("4. RWIN — Rosabon Wealth Investment Note")],
};

// 2026-10-29: RFS approved RWIN answers (A. eligibility and setup, B. interest and payouts).
const rwinV0_2Retired: ProductConfigVersion = { ...rwinV0_2, status: "RETIRED", effectiveTo: INVEST_EFFECTIVE };
const rwinV1_0: ProductConfigVersion = {
  ...rwinV0_2,
  id: "RWIN-1.0",
  version: "1.0",
  effectiveFrom: INVEST_EFFECTIVE,
  effectiveTo: null,
  minimumPrincipal: "50000.00",
  maximumPrincipal: null,
  rateModel: "ANNUAL",
  interestModel: "DAILY_PRORATED",
  ratePercent: "14",
  rateProvenance: "APPROVED",
  tax: { withholdingTaxPercent: "10" },
  rwin: { dayCountBasis: 365, payoutCycleDays: 90, lockDays: 30 },
  formulaVersion: "RWIN-F1",
  ruleNotes: [
    { id: "RWIN-R1", status: "CONFIRMED", note: "Minimum ₦50,000 (the earlier ₦20,000 reference is superseded); no maximum." },
    { id: "RWIN-R2", status: "CONFIRMED", note: "Flat 14% p.a. on every amount; no rate table and no amount tiers. Management/Product Owner approves rate changes, which may apply to new plans, existing plans, or both." },
    { id: "RWIN-R4", status: "CONFIRMED", note: "No fixed tenor or maturity date: the plan runs from the start date until full withdrawal. The first 30 days of every RWIN investment are locked." },
    { id: "RWIN-R5", status: "CONFIRMED", note: "Simple interest accruing daily: end-of-day balance × 14% ÷ 365, on a fixed 365-day basis (also in leap years)." },
    { id: "RWIN-R6", status: "CONFIRMED", note: "Interest is paid every 90 days from the start date (start + 90, then every 90 days). It compounds only if the customer reinvests it at a payout." },
    { id: "RWIN-R8", status: "CONFIRMED", note: "Top-ups merge into the plan's single balance at the same rate, with no minimum. A separate placement needs a new RWIN plan." },
    { id: "RWIN-R7", status: "OPEN", note: "WHT on RWIN interest is not stated; 10% is deducted from each payment (as for RTN) and the net amount is reinvested. Confirm." },
    { id: "RWIN-R9", status: "OPEN", note: "Withdrawal after the lock (partial or full), the treatment of interest accrued since the last payout, and any penalty are not yet specified." },
    { id: "RWIN-R3", status: "CONFIRMED", note: "RTN rates and formulas must not be reused for RWIN." },
  ],
  sources: [...rwinV0_2.sources, { document: "RFS RWIN product decisions (approved answers)", section: "A–B, 2026-10-29" }],
};

const publicSectorV1: ProductConfigVersion = {
  id: "PUBLIC_SECTOR-1.0",
  productCode: "PUBLIC_SECTOR",
  version: "1.0",
  status: "ACTIVE",
  effectiveFrom: "2026-10-28",
  effectiveTo: null,
  minimumPrincipal: "0.01",
  maximumPrincipal: null,
  tenorUnit: "MONTH",
  tenorMinimum: 3,
  tenorMaximum: 24,
  rateModel: "MONTHLY",
  interestModel: null, // FLAT or REDUCING_BALANCE per calculation
  rateInputField: "monthlyRatePercent",
  salaryEligibility: { salaryField: "netMonthlySalary", minimumField: "minimumNetSalary" },
  loanDeductions: LOAN_DEDUCTIONS,
  roundingPolicy: DEFAULT_ROUNDING,
  features: {
    earlySettlement: {
      enabled: true,
      ruleStatus: "PROVISIONAL",
      note: "Same payoff as Personal Loan: remaining principal + current month's interest; future interest waived. No penalty is applied (no Public Sector penalty formula confirmed yet).",
    },
  },
  formulaVersion: "PUBLIC-F1",
  ruleNotes: [
    { id: "PUB-R4", status: "CONFIRMED", note: "Calculation matches Personal Loan: equal monthly or declining (reducing balance) repayment with equal principal components." },
    { id: "PUB-R5", status: "CONFIRMED", note: "Pre-eligibility: net monthly salary must be at least the corridor's minimum net salary (inclusive)." },
    { id: "PUB-R6", status: "CONFIRMED", note: "Interest rate, management fee and WHT are corridor-configured on the Admin Portal and entered per calculation." },
    { id: "PUB-R7", status: "CONFIRMED", note: "Tenor 3–24 months, as Personal Loan." },
    { id: "PUB-R8", status: "CONFIRMED", note: "Corridor (MDA listing) selection and per-corridor amount limits are configured elsewhere and not modelled here." },
    { id: "PUB-R9", status: "OPEN", note: "Penalty fees (late repayment or early liquidation) are not calculated until a formula is confirmed." },
  ],
  sources: [
    { document: LOAN_SPEC, section: "Personal Loan" },
    { document: "RFS product rule (QA request)", section: "Public Sector Loan — 2026-10-28" },
    { document: QA_MATRIX, section: "LN-PUB-001..002" },
  ],
  ...SEED_META,
};

// 2026-10-29: late-payment penalty interest on all loans — simple, accrued daily
// on the overdue amount only, at a rate entered per calculation, for at most 7 days.
const LATE_PENALTY: NonNullable<ProductConfigVersion["latePenalty"]> = {
  rateField: "penaltyRatePercentPerDay",
  daysOverdueField: "daysOverdue",
  overdueAmountField: "overdueAmount",
  maxDays: 7,
};

const LATE_PENALTY_FIELDS: InputFieldDef[] = [
  { kind: "integer", name: "daysOverdue", label: "Late payment: days overdue", required: false, min: 1, max: 365, unit: "days", help: "Optional. Days after the due date that the amount is still unpaid." },
  { kind: "percent", name: "penaltyRatePercentPerDay", label: "Late payment: penalty rate (% per day)", required: false, max: "100", help: "Optional. Daily penalty interest rate from the Admin Portal." },
  { kind: "money", name: "overdueAmount", label: "Late payment: overdue amount (₦)", required: false, min: "0.01", help: "Optional. Defaults to the amount due (the repayment, or the first installment)." },
];

function withLatePenalty(prev: ProductConfigVersion, version: string, formulaVersion: string): [ProductConfigVersion, ProductConfigVersion] {
  const effective = "2026-10-28";
  return [
    { ...prev, status: "RETIRED", effectiveTo: effective },
    {
      ...prev,
      id: `${prev.productCode}-${version}`,
      version,
      status: "ACTIVE",
      effectiveFrom: effective,
      effectiveTo: null,
      latePenalty: LATE_PENALTY,
      formulaVersion,
      ruleNotes: [
        ...prev.ruleNotes.filter((n) => n.id !== "PUB-R9"),
        ...(prev.productCode === "PUBLIC_SECTOR"
          ? [{ id: "PUB-R9", status: "OPEN" as const, note: "Early liquidation penalty is not calculated until a formula is confirmed (late-payment penalty: see LATE-R1)." }]
          : []),
        {
          id: "LATE-R1",
          status: "CONFIRMED",
          note: "Late-payment penalty interest is simple and accrued daily on the overdue amount only: overdue amount × daily penalty rate × days overdue, capped at 7 days. The rate is set on the Admin Portal and entered per calculation. Email communications take priority over this rule.",
        },
      ],
      sources: [...prev.sources, { document: "RFS product rule (QA request)", section: "Late-payment penalty — 2026-10-29" }],
    },
  ];
}

const [nanoV1_1Retired, nanoV1_2] = withLatePenalty(nanoV1_1, "1.2", "NANO-F3");
const [paydayV1_2Retired, paydayV1_3] = withLatePenalty(paydayV1_2, "1.3", "PAYDAY-F4");
const [personalV1_2Retired, personalV1_3] = withLatePenalty(personalV1_2, "1.3", "PERSONAL-F4");
const [publicSectorV1Retired, publicSectorV1_1] = withLatePenalty(publicSectorV1, "1.1", "PUBLIC-F2");

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
      ...LOAN_DEDUCTION_FIELDS,
      ...LATE_PENALTY_FIELDS,
      { kind: "date", name: "startDate", label: "Disbursement date", required: false, help: "Optional. Used to display the due date." },
    ],
    versions: [nanoV1Retired, nanoV1_1Retired, nanoV1_2],
  },
  {
    code: "PAYDAY",
    name: "Payday Loan",
    category: "LOAN",
    status: "ACTIVE",
    description: "Salary-backed loan up to NGN 500,000 for 7–30 days, simple daily interest.",
    fields: [
      {
        kind: "money",
        name: "monthlyIncome",
        label: "Registered monthly income (₦)",
        required: true,
        min: "0.01",
        help: "Principal may not exceed 50% of this amount.",
      },
      { kind: "money", name: "principal", label: "Principal amount (₦)", required: true, min: "0.01", max: "500000.00" },
      { kind: "integer", name: "tenorDays", label: "Tenor", required: true, min: 7, max: 30, unit: "days" },
      ...LOAN_DEDUCTION_FIELDS,
      ...LATE_PENALTY_FIELDS,
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
    versions: [paydayV1Retired, paydayV1_1Retired, paydayV1_2Retired, paydayV1_3],
  },
  {
    code: "PERSONAL",
    name: "Personal Loan",
    category: "LOAN",
    status: "ACTIVE",
    description: "Up to NGN 30,000,000 over 3–24 months; equal monthly or declining (reducing balance) repayment.",
    fields: [
      { kind: "money", name: "principal", label: "Principal amount (₦)", required: true, min: "0.01", max: "30000000.00" },
      { kind: "integer", name: "tenorMonths", label: "Tenor", required: true, min: 3, max: 24, unit: "months" },
      {
        kind: "select",
        name: "interestModel",
        label: "Repayment plan",
        required: true,
        options: [
          { value: "FLAT", label: "Equal monthly repayment" },
          { value: "REDUCING_BALANCE", label: "Declining (reducing balance) repayment" },
        ],
      },
      ...LOAN_DEDUCTION_FIELDS,
      ...LATE_PENALTY_FIELDS,
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
    versions: [personalV1Retired, personalV1_1Retired, personalV1_2Retired, personalV1_3],
  },
  {
    code: "PUBLIC_SECTOR",
    name: "Public Sector Loan",
    category: "LOAN",
    status: "ACTIVE",
    description: "For MDA-listed public-sector employees. Net-salary pre-eligibility, then equal monthly or declining repayment at the corridor's rate.",
    fields: [
      { kind: "money", name: "netMonthlySalary", label: "Net monthly salary (₦)", required: true, min: "0.01", help: "The applicant's net (take-home) salary." },
      {
        kind: "money",
        name: "minimumNetSalary",
        label: "Corridor minimum net salary (₦)",
        required: true,
        min: "0.01",
        help: "Pre-eligibility threshold configured for the corridor the MDA is listed in.",
      },
      { kind: "money", name: "principal", label: "Principal amount (₦)", required: true, min: "0.01" },
      { kind: "integer", name: "tenorMonths", label: "Tenor", required: true, min: 3, max: 24, unit: "months" },
      {
        kind: "select",
        name: "interestModel",
        label: "Repayment plan",
        required: true,
        options: [
          { value: "FLAT", label: "Equal monthly repayment" },
          { value: "REDUCING_BALANCE", label: "Declining (reducing balance) repayment" },
        ],
      },
      { kind: "percent", name: "monthlyRatePercent", label: "Monthly interest rate", required: true, min: "0.0001", max: "100", help: "% per month, as configured for the corridor (e.g. 4)." },
      ...LOAN_DEDUCTION_FIELDS,
      ...LATE_PENALTY_FIELDS,
      { kind: "date", name: "startDate", label: "Disbursement date", required: false, help: "Optional. Used to display installment due dates." },
      {
        kind: "integer",
        name: "settleAfterInstallments",
        label: "Early settlement: after installment #",
        required: false,
        min: 0,
        max: 23,
        help: "Optional, provisional. Number of installments already paid. No penalty applied.",
      },
    ],
    versions: [publicSectorDraftRetired, publicSectorV1Retired, publicSectorV1_1],
  },
  {
    code: "RTN",
    name: "RTN — Rosabon Treasury Note",
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
          { value: "UPFRONT", label: "Upfront (net of WHT)" },
        ],
      },
      {
        kind: "date",
        name: "valueDate",
        label: "Funds-confirmed (value) date",
        required: false,
        help: "Optional. The rate in force on this date applies. Used for maturity, payment and notice dates.",
      },
      {
        kind: "integer",
        name: "daysElapsed",
        label: "Early withdrawal: days elapsed",
        required: false,
        min: 1,
        max: 365,
        unit: "days",
        help: "Optional. At-maturity or upfront placements. One event per calculation (withdrawal, top-up or rollover).",
      },
      {
        kind: "money",
        name: "withdrawalAmount",
        label: "Early withdrawal: amount (₦)",
        required: false,
        min: "0.01",
        help: "Optional. Leave blank to withdraw everything; a smaller amount is a partial withdrawal (at-maturity placements only).",
      },
      { kind: "money", name: "topUpAmount", label: "Top-up: amount (₦)", required: false, min: "0.01", help: "Optional. At-maturity placements only." },
      { kind: "integer", name: "topUpDay", label: "Top-up: on day", required: false, min: 1, max: 364, unit: "days", help: "Days after the funds-confirmed date when the top-up lands." },
      {
        kind: "select",
        name: "rolloverTenorDays",
        label: "Rollover: new tenor",
        required: false,
        options: [60, 90, 120, 180, 365].map((d) => ({ value: String(d), label: `${d} days` })),
        help: "Optional. Rolls principal + net interest into a new at-maturity placement.",
      },
    ],
    versions: [rtnV1Retired, rtnV1_1Retired, rtnV1_2Retired, rtnV1_3],
  },
  {
    code: "REAP",
    name: "REAP — Rosabon Easy Access Plan",
    category: "INVESTMENT",
    status: "VALIDATION_ONLY",
    statusReason: "Approved REAP rate table and return formula are missing (OPEN-REAP-01). Inputs are validated; no return is projected.",
    description: "Goal-based savings plan with a target amount and date (OPEN or LOCKED). Validation only until rates and formula are approved.",
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
      { kind: "money", name: "targetAmount", label: "Target amount (₦)", required: false, min: "10000.00", help: "Optional. The savings goal." },
      { kind: "date", name: "targetDate", label: "Target date", required: false, help: "Optional. When the goal should be reached." },
    ],
    versions: [reapV1Retired, reapV0_2],
  },
  {
    code: "RWIN",
    name: "RWIN — Rosabon Wealth Investment Note",
    category: "INVESTMENT",
    status: "ACTIVE",
    description: "Open-ended plan at a flat 14% p.a., simple interest accruing daily, paid or reinvested every 90 days. First 30 days locked.",
    fields: [
      { kind: "money", name: "principal", label: "Amount (₦)", required: true, min: "50000.00", help: "Minimum ₦50,000; no maximum." },
      { kind: "integer", name: "daysHeld", label: "Projection: days held", required: true, min: 1, max: 3650, unit: "days", help: "No maturity date: project the plan to any day after the start date." },
      {
        kind: "select",
        name: "interestOption",
        label: "90-day interest",
        required: true,
        options: [
          { value: "PAY_OUT", label: "Pay out" },
          { value: "REINVEST", label: "Reinvest (compound)" },
        ],
      },
      { kind: "date", name: "valueDate", label: "Start date", required: false, help: "Optional. Used for payout dates and the end of the 30-day lock." },
      { kind: "money", name: "topUpAmount", label: "Top-up: amount (₦)", required: false, min: "0.01", help: "Optional. No minimum; merges into the balance at the same rate." },
      { kind: "integer", name: "topUpDay", label: "Top-up: on day", required: false, min: 1, max: 3649, unit: "days", help: "Days after the start date when the top-up lands." },
    ],
    versions: [rwinV1Retired, rwinV0_2Retired, rwinV1_0],
  },
];

/** Retired product codes still referenced by saved scenarios. */
const PRODUCT_CODE_ALIASES: Record<string, string> = { PERSONAL_PRIVATE: "PERSONAL" };

export function getProduct(code: string): ProductDefinition | undefined {
  const resolved = PRODUCT_CODE_ALIASES[code] ?? code;
  return PRODUCTS.find((p) => p.code === resolved);
}
