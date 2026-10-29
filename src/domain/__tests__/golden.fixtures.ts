/**
 * Golden/reference fixtures (spec 14.2). Only approved/confirmed worked
 * examples from the source documents are asserted numerically; open rules
 * are asserted as BLOCKED / VALIDATION_ONLY instead.
 */
export interface GoldenFixture {
  id: string;
  productCode: string;
  configVersionId: string;
  inputs: Record<string, unknown>;
  expectedStatus: "CALCULATED" | "VALIDATION_ONLY" | "BLOCKED" | "ERROR";
  expectedSummary?: Record<string, string>;
  expectedSecondary?: Record<string, string>;
  source: string;
  approval: string;
}

export const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    id: "LN-NANO-001",
    productCode: "NANO",
    configVersionId: "NANO-1.1",
    inputs: { principal: "20000", tenorDays: 7 },
    expectedStatus: "CALCULATED",
    expectedSummary: { grossInterest: "420.00", totalRepayable: "20420.00" },
    source: "Loan spec — Nano worked example",
    approval: "Worked example; illustrative rate",
  },
  {
    id: "LN-NANO-003",
    productCode: "NANO",
    configVersionId: "NANO-1.1",
    inputs: { principal: "20000", tenorDays: 30 },
    expectedStatus: "CALCULATED",
    expectedSummary: { grossInterest: "1800.00", totalRepayable: "21800.00" },
    source: "Loan spec — Nano worked example",
    approval: "Worked example; illustrative rate",
  },
  {
    id: "LN-PAY-001",
    productCode: "PAYDAY",
    configVersionId: "PAYDAY-1.2",
    inputs: { monthlyIncome: "400000", principal: "200000", tenorDays: 15 },
    expectedStatus: "CALCULATED",
    expectedSummary: { grossInterest: "9000.00", totalRepayable: "209000.00" },
    source: "Loan spec — Payday worked example",
    approval: "Worked example; illustrative rate",
  },
  {
    id: "LN-PER-001",
    productCode: "PERSONAL",
    configVersionId: "PERSONAL-1.2",
    inputs: { principal: "6000000", tenorMonths: 6, interestModel: "FLAT" },
    expectedStatus: "CALCULATED",
    expectedSummary: { grossInterest: "720000.00", totalRepayable: "6720000.00", installment: "1120000.00" },
    source: "Loan spec — Private sector flat example",
    approval: "Worked example",
  },
  {
    id: "LN-PER-002",
    productCode: "PERSONAL",
    configVersionId: "PERSONAL-1.2",
    inputs: { principal: "6000000", tenorMonths: 6, interestModel: "REDUCING_BALANCE" },
    expectedStatus: "CALCULATED",
    expectedSummary: { grossInterest: "420000.00", totalRepayable: "6420000.00", installment: "1120000.00 → 1020000.00" },
    source: "Loan spec — Private sector reducing-balance example",
    approval: "Worked example",
  },
  {
    id: "LN-PER-003-FLAT",
    productCode: "PERSONAL",
    configVersionId: "PERSONAL-1.2",
    inputs: { principal: "6000000", tenorMonths: 6, interestModel: "FLAT", settleAfterInstallments: 2 },
    expectedStatus: "CALCULATED",
    expectedSecondary: { payoff: "4120000.00" },
    source: "QA matrix LN-PER-003",
    approval: "Worked example; settlement accrual to confirm",
  },
  {
    id: "LN-PER-003-REDUCING",
    productCode: "PERSONAL",
    configVersionId: "PERSONAL-1.2",
    inputs: { principal: "6000000", tenorMonths: 6, interestModel: "REDUCING_BALANCE", settleAfterInstallments: 2 },
    expectedStatus: "CALCULATED",
    expectedSecondary: { payoff: "4080000.00" },
    source: "QA matrix LN-PER-003",
    approval: "Worked example; settlement accrual to confirm",
  },
  {
    id: "RTN-CAL-001",
    productCode: "RTN",
    configVersionId: "RTN-1.3",
    inputs: { investorType: "INDIVIDUAL", principal: "1000000", tenorDays: "90", payoutOption: "MATURITY" },
    expectedStatus: "CALCULATED",
    expectedSummary: { grossInterest: "46232.88", tax: "4623.29", netInterest: "41609.59", maturityPayout: "1041609.59" },
    source: "Investment journeys — RTN example",
    approval: "Confirmed example",
  },
  {
    id: "RTN-EXIT-001",
    productCode: "RTN",
    configVersionId: "RTN-1.3",
    inputs: { investorType: "INDIVIDUAL", principal: "1000000", tenorDays: "90", payoutOption: "MATURITY", daysElapsed: 30 },
    expectedStatus: "CALCULATED",
    // 30/90 = 33.33% elapsed → 80% of 18.75% = 15% p.a. penalty rate.
    // Accrued 15,410.958904; penal charge 12,328.767123; after penalty 3,082.191781;
    // WHT 308.219178; net 2,773.972603 (full precision, rounded at output).
    expectedSecondary: {
      grossInterest: "15410.96",
      penalty: "12328.77",
      taxable: "3082.19",
      tax: "308.22",
      netInterest: "2773.97",
      payout: "1002773.97",
    },
    source: "RFS RTN approved decisions C (supersedes QA matrix 2.25% band)",
    approval: "Approved 2026-10-28",
  },
  {
    id: "RR-001",
    productCode: "REAP",
    configVersionId: "REAP-0.2",
    inputs: { principal: "10000", planType: "LOCKED" },
    expectedStatus: "VALIDATION_ONLY",
    source: "QA matrix RR-001",
    approval: "Validation only",
  },
  {
    id: "RW-001",
    productCode: "RWIN",
    configVersionId: "RWIN-1.0",
    inputs: { principal: "1000000", daysHeld: 90, interestOption: "PAY_OUT" },
    expectedStatus: "CALCULATED",
    // 1,000,000 × 14% × 90 ÷ 365 = 34,520.547945 → 34,520.55 paid; WHT 10% = 3,452.055 → 3,452.06; net 31,068.49
    expectedSummary: { grossInterest: "34520.55", tax: "3452.06", netInterest: "31068.49", balance: "1000000.00", position: "1000000.00" },
    source: "RFS RWIN approved answers A–B (14% p.a., daily simple interest, 90-day payouts)",
    approval: "Approved rules; WHT treatment to confirm",
  },
  {
    id: "LN-PUB-001",
    productCode: "PUBLIC_SECTOR",
    configVersionId: "PUBLIC_SECTOR-1.0",
    inputs: {
      netMonthlySalary: "250000",
      minimumNetSalary: "100000",
      principal: "6000000",
      tenorMonths: 12,
      interestModel: "FLAT",
      monthlyRatePercent: "4",
    },
    expectedStatus: "CALCULATED",
    // QA matrix: ₦500,000 principal + ₦240,000 interest per month.
    expectedSummary: { installment: "740000.00", grossInterest: "2880000.00", totalRepayable: "8880000.00" },
    source: "QA matrix LN-PUB-001 (4% monthly entered as the corridor rate)",
    approval: "Public Sector rules confirmed 2026-10-28",
  },
];
