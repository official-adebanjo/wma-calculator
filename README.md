# RFS Loan & Investment Calculator

Internal QA reference tool for Rosabon Financial Services loan and investment products, built from
`RFS_Loan_Investment_Calculator_Architecture.txt`, `Rosabon_QA_Calculation_Matrix.xlsx` and
`Rosabon_Investment_Deduced_Calculation_Rules.docx`.

It calculates estimates with a full, reproducible breakdown. It never creates loans or investments, or moves money.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · Firebase Auth + Firestore · decimal.js · Zod · Vitest

## Product coverage

| Product | Status | Notes |
| --- | --- | --- |
| Nano Loan | Active | 0.30%/day simple interest (spec's worked-example rate, flagged as illustrative) |
| Payday Loan | Active | Principal capped at 50% of registered monthly income (and ₦500,000). No liquidation (as Nano) |
| Personal Loan | Active | Repayment plan: equal monthly or declining (reducing balance). Liquidation after k installments: full (remaining principal + current month interest) or partial (re-scheduled on the reduced principal: same tenor with lower installments, or same monthly principal with a shorter tenor), with an optional fee % |
| All loans | — | Optional management fee (% of principal) and withholding tax (% of interest), deducted from the amount disbursed. Optional late-payment penalty: simple interest accrued daily on the overdue amount at an entered daily rate, capped at 7 days (email communications take priority) |
| RTN — Rosabon Treasury Note | Active | Approved rules (RTN-1.3): at maturity and upfront confirmed (OPEN-9 resolved: ₦34,682.41), full-precision rounding, early and partial withdrawal (penalty 100/80/60/40/0% of the rate by tenor elapsed), top-up, rollover, payment/notice dates, and upfront early withdrawal (payout = booked principal + 0.90 × (interest accrued on booked principal − penal charge)) |
| RWIN — Rosabon Wealth Investment Note | Active | Open-ended plan (RWIN-1.1): flat 14% p.a. on any amount from ₦50,000, simple interest accruing daily from the funds-confirmed date (end-of-day balance × 14% ÷ 365), paid out or reinvested (net of 10% WHT) every 90 days, top-ups merge into the balance. After the 30-day lock: partial withdrawal (must leave ₦50,000) or full liquidation (balance + accrued − 10% WHT), no penalty, no rollover |
| REAP — Rosabon Easy Access Plan | Validation only | No approved rate table, so no projection is ever shown. Records target amount/date |
| Public Sector Loan | Active | Same calculation as Personal Loan (equal monthly or declining) with an entered corridor rate; pre-eligibility: net salary ≥ corridor minimum net salary. Full or partial liquidation as Personal Loan; late-payment penalty as all loans |

Open rules from the QA matrix (OPEN-RTN-01…07, OPEN-LOAN-01…05, etc.) are shown in the UI next to each product.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in values (see below)
npm run dev
```

### Firebase

- **Client (Auth):** `NEXT_PUBLIC_FIREBASE_*` from the Firebase web app config. Enable the Email/Password
  and Google providers in Firebase Console → Authentication.
- **Server (Admin SDK):** the API routes need a service account. In Firebase Console → Project settings →
  Service accounts, click *Generate new private key*, then set `FIREBASE_CLIENT_EMAIL` and
  `FIREBASE_PRIVATE_KEY` in `.env.local`. On Google Cloud / App Hosting, Application Default Credentials
  are used instead.
- **Firestore:** no index deployment is needed; the queries are designed to work without composite indexes.
  `firestore.rules` denies all direct client access, because this app only uses the Admin SDK. **Do not deploy it
  to a Firebase project shared with other apps**, since it would block their client-side Firestore access. Deploy it
  only to a dedicated project.
- **Roles:** set `ADMIN_EMAILS` / `REVIEWER_EMAILS` (comma-separated). Everyone else is a QA Tester.

### Fully offline (emulators)

```bash
npm run emulators          # auth :9099, firestore :8080, UI :4000 (project demo-rfs-calculator)
```

Then uncomment the emulator block in `.env.local`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm test` | Golden tests from the QA matrix, plus boundary and invariant tests |
| `npm run test:emulator` | Firestore integration tests (unique names, concurrent saves, delete permissions) against the local emulator; needs Java and `firebase-tools` |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run build` | Production build |

## Architecture

```
src/domain/          Pure calculation engine (no UI/Firebase). Rates are server-only.
  config/products.ts Versioned product configuration + RTN Rate Guide
  calculators/       Strategies: daily, personal, rtn, validation-only
  calculate.ts       Orchestrator: validate → resolve config → status gate → strategy
src/app/api/         Route handlers (auth via Firebase ID token)
src/lib/server/      Admin SDK, auth/roles, scenarios + audit repository
src/app/(app)/       Authenticated pages: dashboard, calculators, scenarios, compare, admin
```

- Money uses decimal arithmetic throughout. The rounding mode (component vs final-only) is configurable
  because the approved policy is still open.
- Saved scenarios are immutable snapshots: the server recalculates from the submitted inputs and stores the
  result together with the exact configuration version. Only tester notes can change, and every change is audited.
- To change a rate or rule, add a **new** version in `src/domain/config/products.ts`. Never edit an
  active version.
