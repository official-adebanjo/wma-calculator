# RFS Loan & Investment Calculator

Internal QA reference tool for Rosabon Financial Services loan and investment products, built from
`RFS_Loan_Investment_Calculator_Architecture.txt` and `Rosabon_QA_Calculation_Matrix.xlsx`.

It calculates estimates with a full, reproducible breakdown. It never creates loans or investments, or moves money.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · Firebase Auth + Firestore · decimal.js · Zod · Vitest

## Product coverage

| Product | Status | Notes |
| --- | --- | --- |
| Nano Loan | Active | 0.30%/day is the spec's worked-example rate (flagged as illustrative) |
| Payday Loan | Active | Early-settlement preview is **provisional** |
| Personal Loan — Private | Active | Flat and reducing balance (equal principal); early-settlement preview is **provisional** |
| RTN | Active | At-maturity confirmed; upfront and early withdrawal are **provisional**; top-up and partial withdrawal disabled |
| REAP / RWIN | Validation only | No approved rate table, so no projection is ever shown |
| Personal Loan — Public | Blocked | No approved rules; private-sector rules are not reused |

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
