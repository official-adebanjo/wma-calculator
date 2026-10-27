import { z } from "zod";
import type { CalculationResult, ProductConfigVersion } from "@/domain/types";

export const QA_OUTCOMES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED"] as const;
export type QaOutcome = (typeof QA_OUTCOMES)[number];

/** Tester-editable notes. Kept separate from the immutable calculation snapshot. */
export const qaNotesSchema = z.object({
  comparedField: z.string().max(60).optional(),
  observedValue: z
    .string()
    .trim()
    .max(32)
    .regex(/^-?\d{1,15}(\.\d{1,2})?$|^$/, "Observed value must be a number with at most 2 decimal places.")
    .optional(),
  outcome: z.enum(QA_OUTCOMES),
  defectId: z.string().trim().max(60).optional(),
  evidence: z.string().trim().max(4000).optional(),
});

export type QaNotesInput = z.infer<typeof qaNotesSchema>;

export interface QaNotes extends QaNotesInput {
  /** observed − expected, when both are numeric. */
  difference?: string;
  expectedValue?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Scenario {
  id: string;
  name: string;
  userId: string;
  userEmail: string | null;
  /** Owner's display name at save time; absent on scenarios saved before names existed. */
  userName?: string | null;
  productCode: string;
  productName: string;
  status: CalculationResult["status"];
  configVersionId: string | null;
  calculationId: string;
  createdAt: string;
  /** Immutable snapshot of the full calculation result. */
  result: CalculationResult;
  /** Snapshot of the configuration version used, for reproducibility. */
  configSnapshot: ProductConfigVersion | null;
  qaNotes: QaNotes | null;
}

export type ScenarioListItem = Omit<Scenario, "configSnapshot">;

export const createScenarioSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  productCode: z.string().min(1).max(40),
  inputs: z.record(z.string(), z.unknown()),
  qaOptions: z.object({ rateOverridePercent: z.string().optional(), roundingMode: z.enum(["COMPONENT", "FINAL"]).optional() }).optional(),
});

export const compareRequestSchema = z.object({
  items: z
    .array(
      z.union([
        z.object({ scenarioId: z.string().min(1).max(128) }),
        z.object({
          label: z.string().max(120).optional(),
          productCode: z.string().min(1).max(40),
          inputs: z.record(z.string(), z.unknown()),
          qaOptions: z.object({ rateOverridePercent: z.string().optional(), roundingMode: z.enum(["COMPONENT", "FINAL"]).optional() }).optional(),
        }),
      ]),
    )
    .min(2, "Select at least two scenarios.")
    .max(6, "Compare at most six scenarios."),
});
