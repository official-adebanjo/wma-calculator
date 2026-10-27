import { z } from "zod";
import { dec, MONEY_PATTERN } from "./money";
import type { InputFieldDef, ProductDefinition, RoundingMode } from "./types";

/**
 * Builds the input schema for a product from its field definitions. The same
 * schema powers client-side form validation and server-side API validation.
 *
 * Money values stay as decimal strings; integers are coerced only from clean
 * integer text. Invalid values are never coerced to zero (spec 12).
 */

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function fieldSchema(field: InputFieldDef) {
  return z.unknown().transform((raw, ctx) => {
    if (isBlank(raw)) {
      if (!field.required) return undefined;
      ctx.addIssue({ code: "custom", message: `${field.label} is required.` });
      return z.NEVER;
    }

    switch (field.kind) {
      case "money": {
        const s = typeof raw === "string" ? raw.trim().replace(/,/g, "") : "";
        if (typeof raw !== "string" || !MONEY_PATTERN.test(s)) {
          ctx.addIssue({ code: "custom", message: "Enter a non-negative amount with at most 2 decimal places." });
          return z.NEVER;
        }
        const value = dec(s);
        if (value.lte(0)) {
          ctx.addIssue({ code: "custom", message: "Amount must be greater than zero." });
          return z.NEVER;
        }
        if (field.min && value.lt(dec(field.min))) {
          ctx.addIssue({ code: "custom", message: `Minimum is ₦${Number(field.min).toLocaleString("en-NG", { minimumFractionDigits: 2 })}.` });
          return z.NEVER;
        }
        if (field.max && value.gt(dec(field.max))) {
          ctx.addIssue({ code: "custom", message: `Maximum is ₦${Number(field.max).toLocaleString("en-NG", { minimumFractionDigits: 2 })}.` });
          return z.NEVER;
        }
        return value.toFixed(2);
      }
      case "integer": {
        const s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
        if (!/^\d{1,6}$/.test(s)) {
          ctx.addIssue({ code: "custom", message: "Enter a whole number." });
          return z.NEVER;
        }
        const n = Number(s);
        if (field.min !== undefined && n < field.min) {
          ctx.addIssue({ code: "custom", message: `Minimum is ${field.min}${field.unit ? ` ${field.unit}` : ""}.` });
          return z.NEVER;
        }
        if (field.max !== undefined && n > field.max) {
          ctx.addIssue({ code: "custom", message: `Maximum is ${field.max}${field.unit ? ` ${field.unit}` : ""}.` });
          return z.NEVER;
        }
        return n;
      }
      case "select": {
        const s = String(raw);
        if (!field.options.some((o) => o.value === s)) {
          ctx.addIssue({ code: "custom", message: `Select a valid ${field.label.toLowerCase()}.` });
          return z.NEVER;
        }
        return s;
      }
      case "date": {
        const s = typeof raw === "string" ? raw.trim() : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
          ctx.addIssue({ code: "custom", message: "Enter a valid date (YYYY-MM-DD)." });
          return z.NEVER;
        }
        return s;
      }
    }
  });
}

export function buildInputSchema(product: Pick<ProductDefinition, "fields">) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of product.fields) shape[field.name] = field.required ? fieldSchema(field) : fieldSchema(field).optional();
  // Missing keys are treated as blank so required-field messages are consistent.
  const filled = (v: unknown) =>
    v && typeof v === "object" ? { ...Object.fromEntries(product.fields.map((f) => [f.name, ""])), ...(v as object) } : v;
  return z.preprocess(filled, z.object(shape));
}

/** QA-only options. A rate override is always labelled in the result. */
export const qaOptionsSchema = z
  .object({
    rateOverridePercent: z
      .string()
      .trim()
      .regex(/^\d{1,3}(\.\d{1,6})?$/, "Enter a percentage with up to 6 decimal places.")
      .refine((s) => dec(s).gt(0) && dec(s).lte(100), "Override must be greater than 0 and at most 100.")
      .optional(),
    roundingMode: z.enum(["COMPONENT", "FINAL"]).optional(),
  })
  .strict();

export type QaOptions = { rateOverridePercent?: string; roundingMode?: RoundingMode };

export const calculationRequestSchema = z.object({
  productCode: z.string().min(1).max(40),
  inputs: z.record(z.string(), z.unknown()),
  qaOptions: qaOptionsSchema.optional(),
});

export type CalculationRequest = z.infer<typeof calculationRequestSchema>;
