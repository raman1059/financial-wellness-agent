# CLAUDE.md — Project Context & Development Guide

This file is read by Claude Code at the start of every session. It contains the full context, constraints, architecture decisions, domain knowledge, and prompts used to build this project.

---

## Project Identity

**Name:** Financial Wellness & Tax AI Agent  
**Stack:** Next.js 15 App Router · TypeScript 5 · Auth.js v5 · Anthropic Claude · Prisma 6 (mocked locally)  
**Purpose:** AI-powered payroll and tax assistant for Indian salaried employees  
**Demo:** `demo@example.com` / `demo1234`

---

## Non-Negotiable Constraints

These must be respected in every session without being re-asked:

1. **Mock data only.** All persistence goes through `mock-data.ts` → `mockPrisma`. No real database, no real Prisma migrations. Never add `DATABASE_URL` as a required env var.

2. **Zero required env vars.** The app must boot and demo with no `.env.local`. Auth secret has a hardcoded fallback. AI has a mock response path. Anthropic client is lazy-initialised.

3. **Never use bcrypt at runtime in the mock path.** `verifyMockCredentials()` compares plain text — this is intentional and flagged in comments. Don't add bcrypt to the demo auth flow.

4. **`userId` always from JWT session, never from request body/params.** This is the core of the security model. Every handler receives `{ userId }` from the session — not from the caller.

5. **Audit failures never crash the main flow.** All `auditService.log*()` calls are fire-and-forget (wrapped in try/catch or called with `void`). Never `await` them in a way that could block a response.

6. **No comments explaining WHAT the code does.** Only add comments when the WHY is non-obvious: a hidden constraint, a workaround, a formula, a compliance rule. Well-named identifiers replace descriptive comments.

7. **No extra abstractions.** Don't add helper functions, utilities, or abstractions beyond what the current task requires. Three similar lines is better than a premature abstraction.

---

## Architecture — Clean Architecture, Four Layers

Dependencies always point inward. The domain layer has zero framework imports.

```
Presentation  →  Application  →  Infrastructure
                    ↓
                  Domain  (no deps)
```

| Layer | Path | Rule |
|---|---|---|
| Presentation | `app/` | Next.js pages + route handlers. No business logic. |
| Application | `src/application/` | Use-cases + services. No Next.js / Prisma imports. |
| Infrastructure | `src/infrastructure/` | All I/O — Prisma, Anthropic, OCR, Storage. |
| Domain | `src/domain/` | Entities, value objects, repository interfaces, pure services. Zero framework imports. |
| Lib | `src/lib/` | Cross-cutting — auth, validation, errors, middleware, rate limiter. |

---

## Key Files and Their Roles

### Data Layer

| File | Role |
|---|---|
| `mock-data.ts` | Single source of truth for all demo data. In-memory Prisma mock. All seed records live here. |
| `src/infrastructure/db/prisma/client.ts` | Exports `prisma = mockPrisma`. Swap for real `PrismaClient` when DATABASE_URL is set. |
| `prisma/schema.prisma` | 9 models: User, Employee, PayrollRecord, Payslip, TaxDeclaration, InvestmentProof, ChatSession, ChatMessage, AuditLog. |

### Auth & Security

| File | Role |
|---|---|
| `src/lib/auth/auth.config.ts` | Auth.js v5 config. Credentials provider + Google OAuth (env-gated). Emits `AUTH_LOGIN_SUCCESS/FAILURE` audit events in `authorize()`. |
| `src/lib/auth/rbac.ts` | `Action` union type + `permissions` map. `can(role, action)` helper. Pattern: `resource:verb:scope`. |
| `src/lib/auth/ownership.ts` | `assertOwnership(callerId, role, resourceId, resourceType)` — 404 on cross-user access (not 403, prevents ID enumeration). |
| `src/lib/middleware/with-auth.ts` | `withAuth`, `withPermission`, `withRoles` HOFs. Every route handler must be wrapped in one. |
| `src/lib/middleware/request-context.ts` | `extractRequestContext(req)` — pulls `ipAddress`, `userAgent`, `requestId` from headers. Pass to `auditService.logEvent()`. |
| `src/lib/rate-limiter.ts` | In-process sliding window. `checkRateLimit(userId, 20, 60_000)`. Replace with Redis (Upstash) in production. |
| `src/lib/encryption/field-cipher.ts` | AES-256-GCM for PAN / Aadhaar fields. Key from `FIELD_ENCRYPTION_KEY` env var; falls back to zero-key in demo (flagged). |

### AI Pipeline

| File | Role |
|---|---|
| `src/infrastructure/ai/prompts/system.prompt.ts` | 353-line production system prompt. Contains G-1 through G-6 grounding rules, 7 named failure modes, 12-term payroll glossary, salary table template. Never shorten or simplify. |
| `src/infrastructure/ai/intent-classifier.ts` | Regex-based tagger. Maps user message → `IntentTag[]` → minimal tool allowlist. Prevents Claude from calling tax tools on payroll questions. |
| `src/infrastructure/ai/context-builder.ts` | `buildUserSnapshot(userId)` — 3 COUNT queries. `buildSystemPrompt()` — appends "USER DATA CONTEXT" section. When count=0, appends hard "Do NOT fabricate" warning. |
| `src/infrastructure/ai/tools/` | 4 tools: `get_payroll_history`, `get_tax_estimate`, `get_payslip_data`, `get_ytd_summary`. Each is `userId`-scoped — cannot access other users' data. |
| `src/application/services/grounding.service.ts` | Strips `[source:TOOL_USE_ID:FIELD_NAME]` markers. Detects ₹ in response. If `hasRupees && !isGrounded` → `refusalForUngroundedResponse()`. |
| `src/application/services/confidence-scorer.ts` | Scores `high/medium/low/refused` based on grounding state, data completeness, OCR confidence. |
| `app/api/chat/route.ts` | 14-step handler: auth → rate limit → validate → session → intent → context → tool-use loop → ground → score → persist → audit → respond. |

### Audit Logging

| File | Role |
|---|---|
| `src/domain/audit/audit-events.ts` | 27 typed `AuditAction` values. `AuditMetadataMap` — per-action payload shapes. `ACTION_SEVERITY` — deterministic severity. `ACTION_COMPLIANCE_TAGS` — DPDP/SOC2/ISO27001. |
| `src/application/services/audit.service.ts` | `log(input)` — legacy untyped. `logEvent<A>(action, metadata, context)` — typed, compile-time enforced. Severity auto-resolved from `ACTION_SEVERITY`. |
| `src/infrastructure/audit/db-audit-logger.ts` | Singleton `auditService`. Import this everywhere — do not instantiate `AuditService` directly. |
| `app/api/audit/route.ts` | `GET /api/audit` with filtering: `action`, `userId`, `severity`, `regulation`, `from`, `to`, `success`, `limit`, `page`. ADMIN/ACCOUNTANT only. |

### Tax Engine

| File | Role |
|---|---|
| `src/domain/services/tax-bracket.service.ts` | `computeBreakdown(income, regime, fy)` → `{slabTax, surcharge, cess, totalTax, rebateApplied}`. `computeTax()` convenience wrapper. `standardDeduction(regime, fy)`. `effectiveRate()`. |
| `src/domain/services/tax-deduction.service.ts` | Pure functions: `compute80C`, `compute80CCD1B`, `compute80D`, `compute24B`, `compute80E`, `computeHraExemption`, `computeOldRegimeDeductions`. |
| `src/application/use-cases/tax/run-tax-simulation.usecase.ts` | Fetches payroll + declaration, computes both regimes. Emits `TAX_SIMULATION_RUN` audit event. |
| `src/application/use-cases/tax/simulate-tax-savings.usecase.ts` | `runScenario()` for each section: modifies baseline, recomputes, returns savings + marginalRate + postTaxCost. |
| `src/application/use-cases/tax/generate-proof-checklist.usecase.ts` | Maps declaration fields → `DECLARATION_FIELD_TO_PROOF` → uploaded proofs → status. Computes `taxAtRisk`, generates recommendations. |
| `src/domain/services/proof-catalog.ts` | 13 proof types. `PROOF_CATALOG` — per-type metadata (acceptedDocuments, howToObtain, checkBefore, sectionCap). `DECLARATION_FIELD_TO_PROOF` map. |

### OCR Pipeline

| File | Role |
|---|---|
| `src/infrastructure/ocr/document-processor.ts` | Main orchestrator. 8-step pipeline: Classify → Extract → Normalize → Extract Fields → Impute → Validate → Score → Return. |
| `src/infrastructure/ocr/mock-ocr.engine.ts` | Returns realistic mock OCR output. Used when no real OCR provider is configured. |
| `src/infrastructure/ocr/field-imputor.ts` | Derives missing fields: `gross = basic + hra + special`, `pf = basic × 0.12`, etc. Tags imputed fields in `imputedFields[]`. |
| `src/infrastructure/ocr/field-validator.ts` | Cross-field consistency: `gross - deductions ≈ netSalary`. Returns `ValidationIssue[]` with severity. |

---

## Indian Payroll Domain Knowledge

Always apply these when writing payroll logic:

```
grossSalary     = basicSalary + hra + specialAllowance + lta + medicalAllowance + otherEarnings
providentFund   = Math.round(basicSalary * 0.12)           // Employee PF contribution
professionalTax = state slab (Maharashtra: 200/month for salary > 10K)
totalDeductions = providentFund + professionalTax + tdsDeducted + esic + otherDeductions
netSalary       = grossSalary - totalDeductions
```

**Indian Financial Year:** April 1 to March 31.

Parsing `"2024-25"` safely:
```typescript
const [fyStartYear] = financialYear.split("-").map(Number);
const fyEndYear = fyStartYear + 1;
// April–December → payPeriodYear === fyStartYear
// January–March  → payPeriodYear === fyEndYear
```

**Known bug that was fixed:** `"2024-25".split("-").map(Number)` gives `[2024, 25]`. Using `2000 + fyEnd` gives year `2025` (correct) but using `2000 + fyStart` gives year `4024` (bug). Always use `fyStartYear` directly — it is already 4 digits.

**HRA Exemption (min of three):**
```
1. Actual HRA received
2. 50% of basic (metro cities: Delhi, Mumbai, Chennai, Kolkata) or 40% (others)
3. Rent paid - 10% of basic
```

---

## Tax Domain Knowledge (India)

**FY 2024-25 New Regime slabs:**
- 0–3L: 0%, 3–7L: 5%, 7–10L: 10%, 10–12L: 15%, 12–15L: 20%, 15L+: 30%
- Standard deduction: ₹75,000 (Budget 2024 amendment — NOT ₹50,000)
- 87A rebate threshold: ₹7,00,000

**FY 2025-26 New Regime slabs (Budget 2025):**
- 0–4L: 0%, 4–8L: 5%, 8–12L: 10%, 12–16L: 15%, 16–20L: 20%, 20–24L: 25%, 24L+: 30%
- 87A rebate threshold: ₹12,00,000

**Old Regime (both FYs):**
- 0–2.5L: 0%, 2.5–5L: 5%, 5–10L: 20%, 10L+: 30%
- Standard deduction: ₹50,000
- 87A rebate threshold: ₹5,00,000

**Surcharge (above ₹50L):**
- >50L: 10%, >1Cr: 15%, >2Cr: 25% (New Regime capped here), >5Cr: 37% (Old Regime only)

**Cess:** 4% on (slabTax + surcharge). Applied after rebate.

**Section caps:**
- 80C: ₹1,50,000 (PPF + ELSS + LIC + HomeLoanPrincipal + NSC + Tuition + Other80C combined)
- 80CCD(1B): ₹50,000 (NPS Tier-1 additional, ABOVE the 80C cap)
- 80D self: ₹25,000 (₹50,000 if self or spouse is senior citizen ≥60)
- 80D parents: ₹50,000
- 24(b): ₹2,00,000 (self-occupied home loan interest)
- 80E: No cap (education loan interest)

---

## AI Grounding Rules (Absolute)

These are enforced in the system prompt and must not be weakened:

- **G-1:** Never state a ₹ figure that isn't directly from a tool call result
- **G-2:** Never reuse figures from a previous conversation turn without re-calling the tool
- **G-3:** When data is partial, explicitly name the missing months/records
- **G-4:** Imputed fields must be labelled "estimated" with the formula disclosed
- **G-5:** Conflicting data → report the conflict, don't silently resolve it
- **G-6:** Refusal must name the specific data gap and the specific remedy — never vague

**Grounding gate (enforced in code):**
```typescript
if (grounded.hasRupees && !grounded.isGrounded) {
  return groundingService.refusalForUngroundedResponse();
}
```

**Citation format:** `[source:TOOL_USE_ID:FIELD_NAME]`  
Example: `"Your gross was ₹1,40,000 [source:tu_abc123:grossSalary]"`

---

## Prompts Used to Build This Project

These are the 16 role-based prompts used in exact order across the design and implementation sessions. Each prompt is reproduced verbatim, followed by what it produced.

---

### Prompt 1 — Understand the Assignment
```
You are a Principal Engineer.

Analyze the following Financial Wellness & Tax AI Agent requirements.

First, identify:
1. Functional requirements
2. Non-functional requirements
3. Security requirements
4. AI-specific requirements
5. Optional bonus features

Then create an implementation roadmap prioritized for a 1-hour engineering assessment.

Do not generate code yet.
Focus on architecture and execution plan.
```
→ Produced: requirements analysis, 5-category breakdown (functional, non-functional, security, AI-specific, bonus), prioritised implementation roadmap used to sequence all subsequent prompts.

---

### Prompt 2 — Define Tech Stack
```
Act as a Staff Engineer.

I am building this solution using Next.js full-stack.

Recommend the complete technology stack including:
- Frontend
- Backend APIs
- Database
- ORM
- Authentication
- AI integration
- Document processing
- Validation
- Logging

Justify each choice based on development speed, maintainability, and assessment expectations.

Provide final stack recommendations.
```
→ Produced: final stack — Next.js 15 App Router, TypeScript 5, PostgreSQL, Prisma 6, Auth.js v5, Anthropic SDK, Zod, Pino, Inngest, Tailwind CSS. Justifications documented in README.

---

### Prompt 3 — Project Structure
```
Act as a Lead Engineer.

Create a production-inspired folder structure for a Next.js full-stack application.

Requirements:
- Authentication
- Payroll service
- Payslip upload
- OCR processing
- AI orchestration
- Tax simulation
- Audit logging
- Access control

Explain responsibility of every folder.

Follow clean architecture principles.
```
→ Produced: the four-layer clean architecture (`app/` → `src/application/` → `src/infrastructure/` → `src/domain/`) with `src/lib/` for cross-cutting concerns. Every folder's single responsibility defined here.

---

### Prompt 4 — Database Schema
```
Act as a Database Architect.

Design PostgreSQL schema using Prisma.

Entities:
- Employee
- PayrollRecord
- Payslip
- TaxDeclaration
- InvestmentProof
- ChatSession
- ChatMessage
- AuditLog

Requirements:
- Multi-user support
- User-level isolation
- Ownership validation
- Audit tracking

Generate complete Prisma schema.
```
→ Produced: `prisma/schema.prisma` — 9 models (User + 8 above), all enums, denormalised `userId` on every model for RLS-friendly ownership queries, composite indexes.

---

### Prompt 5 — Authentication & Authorization
```
Act as a Security Architect.

Design authentication and authorization.

Requirements:
- Employee can access only their own payroll data
- JWT based authentication
- Middleware protection
- Ownership verification
- Role support for Admin and Employee
- Prevention of cross-user data leakage

Provide architecture, flow diagram and implementation strategy.
```
→ Produced: Auth.js v5 credentials provider, `withAuth`/`withPermission`/`withRoles` HOFs, `assertOwnership()` returning 404 (not 403) to prevent ID enumeration, `can(role, action)` RBAC helper, `resource:verb:scope` permission strings.

---

### Prompt 6 — Payroll Domain Design
```
Act as a FinTech Solution Architect.

Design the payroll domain model.

Support:
- Basic Salary
- HRA
- LTA
- Special Allowance
- PF
- Professional Tax
- TDS
- Reimbursements
- Gross Pay
- Net Pay
- YTD values

Create DTOs, service contracts and API response structures.
```
→ Produced: `PayrollRecord` entity shape, YTD aggregation logic, Indian payroll formulae (PF = 12% basic, PT state slab, gross/net computation), `GET /api/payroll/ytd` response schema, 12-component payslip breakdown.

---

### Prompt 7 — Payslip Upload Flow
```
Act as a Senior Backend Engineer.

Design the payslip upload workflow.

Requirements:
- PDF upload
- Image upload
- Mock OCR support
- Field extraction
- Validation
- Storage
- Error handling

Explain end-to-end flow from upload to structured data generation.

Provide API design.
```
→ Produced: `POST /api/documents/upload` multipart handler, mock storage path, 3-status lifecycle (UPLOADED → PROCESSING → VERIFIED/FAILED), `Payslip` record creation, Inngest background job trigger for async OCR.

---

### Prompt 8 — OCR & Document Processing
```
Act as an AI Engineer.

Design a document processing module.

Input:
- Payslip PDF
- Payslip Image
- Mock OCR JSON

Output:
- Structured payroll data

Handle:
- Missing fields
- Incorrect OCR values
- Inconsistent formats
- Duplicate uploads

Provide implementation pseudocode.
```
→ Produced: `src/infrastructure/ocr/` — 8-step pipeline (Classify → Extract → Normalize → Extract Fields → Impute → Validate → Score → Return), `mock-ocr.engine.ts`, `field-imputor.ts` (derives gross/pf from parts), `field-validator.ts` (cross-field consistency checks), OCR confidence scoring.

---

### Prompt 9 — AI Assistant Architecture
```
Act as an AI Solutions Architect.

Design the AI assistant workflow.

Requirements:
- User asks payroll questions
- AI uses payroll records
- AI uses uploaded payslips
- AI answers only from available data
- No hallucinations

Explain:
- Retrieval strategy
- Context building
- Prompt orchestration
- Source citation
- Refusal behavior

Provide sequence diagrams.
```
→ Produced: intent classifier (`intent-classifier.ts`), context builder (`context-builder.ts`), Claude tool-use loop (multi-turn until `end_turn`), grounding service, confidence scorer. Citation format `[source:TOOL_USE_ID:FIELD_NAME]` defined here.

---

### Prompt 10 — System Prompt
```
Create a production-grade system prompt for a Financial Wellness AI Agent.

Rules:
- Answer only from provided payroll data
- Answer only from uploaded payslips
- Never fabricate values
- Cite source fields used
- Mention assumptions explicitly
- Refuse unsupported tax advice
- Explain payroll terms in employee-friendly language

Return final system prompt.
```
→ Produced: `src/infrastructure/ai/prompts/system.prompt.ts` — 353 lines, 9 sections, G-1 through G-6 grounding rules, 7 named failure modes, 12-term payroll glossary, salary table template. Never shorten or simplify this file.

---

### Prompt 11 — Chat API
```
Act as a Senior Backend Engineer.

Design the AI chat endpoint.

Input:
- User question
- Employee ID
- Payroll data
- Payslip data

Output:
- Grounded answer
- Sources used
- Confidence note

Provide request/response schema and implementation flow.
```
→ Produced: `app/api/chat/route.ts` — 14-step handler (auth → rate limit → validate → session → intent → context → tool-use loop → ground → score → persist → audit → respond), streaming (Vercel AI SDK) + non-streaming modes, session management.

---

### Prompt 12 — Tax Simulation Module
```
Act as a Tax-Tech Architect.

Design a tax-saving simulator.

Support:
- Section 80C
- Declared deductions
- Additional investment scenarios

Requirements:
- Clearly document assumptions
- Avoid compliance guarantees
- Show estimated savings
- Explain calculations

Provide formulas, APIs and pseudocode.
```
→ Produced: `tax-bracket.service.ts` (slab computation, surcharge, cess, 87A rebate), `tax-deduction.service.ts` (80C/80CCD/80D/24b/80E/HRA pure functions), `run-tax-simulation.usecase.ts`, `simulate-tax-savings.usecase.ts`, `POST /api/tax/simulate`.

---

### Prompt 13 — Investment Proof Checklist
```
Design a personalized investment-proof checklist generator.

Inputs:
- Employee declarations
- Submitted proofs
- Missing proofs

Output:
- Pending items
- Submitted items
- Recommended actions

Generate service design, APIs and response structure.
```
→ Produced: `src/domain/services/proof-catalog.ts` (13 proof types with metadata), `generate-proof-checklist.usecase.ts` (5 proof statuses, tax-at-risk computation, marginal rate, 5 recommendation categories), `GET /api/tax/checklist`.

---

### Prompt 14 — Audit Logging
```
Act as a Security Engineer.

Design audit logging.

Track:
- Login
- Payslip upload
- Payroll access
- AI queries
- Tax simulations

Design schema, APIs and logging strategy.

Explain how logs help with compliance and debugging.
```
→ Produced: `src/domain/audit/audit-events.ts` (27 typed `AuditAction` values, `AuditMetadataMap`, compile-time metadata enforcement, `ACTION_SEVERITY`, `ACTION_COMPLIANCE_TAGS` for DPDP/SOC2/ISO27001), `AuditService.logEvent<A>()`, `GET /api/audit`, `request-context.ts`, 12 seed audit log entries.

---

### Prompt 15 — Edge Cases
```
Act as a QA Architect.

Identify all edge cases.

Cover:
- Missing payslip fields
- Corrupted uploads
- Unauthorized access
- Empty payroll records
- OCR failures
- Prompt injection
- Invalid tax declarations
- Missing YTD values

Provide expected behavior for every case.
```
→ Produced: 18 documented edge cases in README (OCR mismatch warning when `|declared − parsed| > ₹100`, cross-user access → 404, empty payroll → hard "do not fabricate" warning in system prompt, prompt injection → intent classifier drops to safe tool allowlist, FY format validation regex, declaration-without-payroll handling).

---

### Prompt 16 — Complete Implementation
```
Using all previous design decisions, generate the implementation plan in exact build order.

For each step provide:
- Files to create
- APIs to build
- Database changes
- UI screens
- Testing required

Optimize for completing the assessment within 1 hour while still satisfying all mandatory requirements.
```
→ Produced: the sequenced build plan used across all sessions — config → schema → auth → domain → application → infrastructure → routes → mock data enrichment → audit logging — preserved in the plan file at `~/.claude/plans/mossy-sleeping-crescent.md`.

---

## Coding Conventions

### TypeScript Patterns

**Route handlers** — always wrap with HOFs:
```typescript
export const GET = withPermission("payroll:read:own", async (req, _ctx, { userId }) => {
  // userId is from JWT — never from req
});
```

**Audit events** — use typed `logEvent` for new code, `log()` only for legacy compatibility:
```typescript
void auditService.logEvent(
  "TAX_SIMULATION_RUN",
  { financialYear, regime, grossIncome, taxLiability, durationMs },
  { userId, resourceType: "TaxDeclaration", resourceId: declaration?.id },
);
```

**Error handling** — use `AppError` subclasses, `toApiError()` in route handlers:
```typescript
try {
  const result = await useCase.execute(userId, fy);
  return NextResponse.json(result, { status: 200 });
} catch (err) {
  const { error, status } = toApiError(err);
  return NextResponse.json({ error }, { status });
}
```

**Zod validation** — always validate at API boundary, never inside use-cases:
```typescript
const parsed = someSchema.safeParse(rawBody);
if (!parsed.success) {
  return NextResponse.json(
    { error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
    { status: 422 },
  );
}
```

**Indian number formatting** — use `en-IN` locale:
```typescript
new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount)
```

### File Naming Conventions

| Type | Pattern | Example |
|---|---|---|
| Use-case | `kebab-name.usecase.ts` | `run-tax-simulation.usecase.ts` |
| Service | `kebab-name.service.ts` | `grounding.service.ts` |
| Repository | `prisma-kebab.repository.ts` | `prisma-audit-log.repository.ts` |
| AI Tool | `get-kebab-name.tool.ts` | `get-payroll-history.tool.ts` |
| Entity | `kebab-name.entity.ts` | `payroll-record.entity.ts` |
| Value Object | `kebab-name.vo.ts` | `money.vo.ts` |
| Route | `route.ts` (Next.js convention) | `app/api/payroll/route.ts` |

### Import Alias

All `src/` imports use `@/` alias (configured in `tsconfig.json`):
```typescript
import { prisma } from "@/infrastructure/db/prisma/client";
import { auditService } from "@/infrastructure/audit/db-audit-logger";
```

Imports from `mock-data.ts` (at repo root) use relative paths with `../../../../mock-data`.

---

## Adding a New Feature — Checklist

1. **Domain:** Add entity/value-object/repository interface if new concept.
2. **Application:** Add use-case in `src/application/use-cases/DOMAIN/`.
3. **Infrastructure:** Add Prisma repo implementation + mock method in `mock-data.ts`.
4. **Validation:** Add Zod schema in `src/lib/validation/schemas/`.
5. **Route:** Wrap handler with `withPermission()`, validate input, call use-case.
6. **Audit:** Call `auditService.logEvent()` — add new action to `audit-events.ts` if needed.
7. **Mock data:** Add seed records to `mock-data.ts` so the demo works immediately.

---

## Adding a New Audit Event — Checklist

1. Add action string to `AuditAction` union in `src/domain/audit/audit-events.ts`
2. Add metadata shape to `AuditMetadataMap`
3. Add severity to `ACTION_SEVERITY`
4. Add compliance tags to `ACTION_COMPLIANCE_TAGS`
5. Add description to `ACTION_DESCRIPTIONS`
6. Call `auditService.logEvent("YOUR_ACTION", metadata, context)` at the call site

TypeScript will show a compile error at step 6 if the metadata doesn't match step 2.

---

## Adding a New AI Tool — Checklist

1. Create `src/infrastructure/ai/tools/get-YOUR-data.tool.ts`
2. Export `definition` (Anthropic Tool object) and `executor(userId, input)` function
3. Scope the executor: `WHERE userId = userId` on every query
4. Return `{ data: ..., count: ..., reason?: "no_data_found" }` structure
5. Add to `ALL_TOOLS` registry in `app/api/chat/route.ts`
6. Add to `executeTool()` switch in `app/api/chat/route.ts`
7. Add to `INTENT_TOOL_MAP` in `src/infrastructure/ai/intent-classifier.ts`

---

## Mock Data — What Exists

All in `mock-data.ts`:

| Entity | Count | Notes |
|---|---|---|
| Users | 1 | `demo@example.com` / `demo1234`, role: USER |
| Employees | 1 | Senior Software Engineer, TechCorp India, Mumbai |
| Payroll Records | 27 | Apr 2024 – Jun 2026. Salary: basic ₹85K→105K with increments in Sep and Apr. |
| Payslips | 2 | `slip_001` VERIFIED 97% confidence, `slip_002` PARSED 88% confidence |
| Tax Declaration | 1 | FY 2024-25, New Regime. `elssAmount: 30000`, `ppfAmount: 50000`, `lifeInsurance: 25000`, `selfHealthInsurance: 20000` |
| Investment Proofs | 4 | PPF_STATEMENT (APPROVED), LIFE_INSURANCE_PREMIUM (PENDING), ELSS_STATEMENT (REJECTED — wrong FY), HEALTH_INS_SELF (NEEDS_RESUBMISSION + OCR mismatch ₹18,500 vs ₹20,000) |
| Chat Sessions | 1 | `ses_demo_001` — tax query |
| Chat Messages | 2 | Sample user + assistant message with citations |
| Audit Logs | 12 | All event types seeded for demo: login, payroll, OCR, AI, tax, permission denied, rate limit |

**IDs used in seed data:**
```
USER_ID = "user_demo_001"
EMP_ID  = "emp_demo_001"
TAX_ID  = "tax_demo_001"
SES_ID  = "ses_demo_001"
```

---

## API Surface — Quick Reference

```
POST   /api/auth/[...nextauth]      Auth.js handler
GET    /api/payroll                 List payroll records (?fy=2024-25)
POST   /api/payroll                 Create record
GET    /api/payroll/:id             Get single record
PATCH  /api/payroll/:id             Update record
DELETE /api/payroll/:id             Delete record
GET    /api/payroll/ytd             Year-to-date summary (?fy=2024-25)
GET    /api/documents               List payslips
POST   /api/documents/upload        Upload + OCR payslip
GET    /api/documents/:id           Get single payslip
DELETE /api/documents/:id           Delete payslip
GET    /api/tax/estimate            Tax simulation (?fy=2024-25)
POST   /api/tax/simulate            What-if scenarios
GET    /api/tax/checklist           Investment proof checklist (?fy=2024-25)
POST   /api/chat                    AI assistant (stream: true/false)
GET    /api/audit                   Query audit logs (audit:read only)
POST   /api/webhooks/inngest        Inngest background job handler
```

---

## Response Conventions

**Success:** `{ data: ... }` or flat object, status 200/201  
**Validation error:** `{ error: string, code: "VALIDATION_ERROR", details: ZodFlatError }`, status 422  
**Auth error:** `{ error: "Unauthorized", code: "UNAUTHENTICATED" }`, status 401  
**Permission error:** `{ error: "Forbidden", code: "FORBIDDEN" }`, status 403  
**Not found:** `{ error: "...", code: "NOT_FOUND" }`, status 404  
**Rate limit:** `{ error: "...", code: "RATE_LIMITED" }`, status 429  
**Server error:** `{ error: "Internal server error", code: "INTERNAL_ERROR" }`, status 500

**Chat streaming format:**
```
0:"text chunk"\n      ← Vercel AI SDK text frame
8:{meta object}\n     ← metadata frame (sources, confidence, tokens)
```

---

## Known Patterns to Not Break

1. **`auth.config.ts` secret:** Uses `||` (not `??`) to reject empty strings. Do not change to `??`.

2. **FY string parsing:** Always `split("-").map(Number)` → `[fyStartYear, shortYear]`. `fyEndYear = fyStartYear + 1`. Never `2000 + shortYear` for the start year.

3. **`taxDeclaration.findFirst` with `include`:** The mock supports `include: { investmentProofs: true }`. Adding other includes requires updating the mock.

4. **`ACTION_SEVERITY` is the authority on severity.** Never set severity in metadata manually. The service reads from this map.

5. **Grounding service `refusalForUngroundedResponse()`** returns a specific string. Don't change it — it's part of the tested contract with the UI.

6. **`withPermission` signature:** `withPermission("action", async (req, _ctx, { userId, role }) => {...})`. The `_ctx` is always unused (Next.js route context) but must be present.

---

## Environment Variables — Full List

| Variable | Default (demo) | Purpose |
|---|---|---|
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | `"demo-dev-secret-do-not-use-in-production"` | JWT signing |
| `NEXTAUTH_URL` | Not required locally | Canonical URL for production |
| `ANTHROPIC_API_KEY` | Not required (mock mode) | Live Claude responses |
| `DATABASE_URL` | Not required (mock mode) | PostgreSQL connection |
| `DIRECT_URL` | Not required | Direct PostgreSQL for migrations |
| `GOOGLE_CLIENT_ID/SECRET` | Not required | Google OAuth |
| `FIELD_ENCRYPTION_KEY` | `"0".repeat(64)` | AES-256-GCM for PAN/Aadhaar |
| `INNGEST_EVENT_KEY/SIGNING_KEY` | Not required | Background jobs |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Not required | Production rate limiting |
| `STORAGE_BUCKET` | Not required | File storage bucket name |
| `RESEND_API_KEY` | Not required | Transactional email |

---

## What Is Intentionally NOT Implemented

These are out of scope — don't add them unless explicitly asked:

- Real OCR integration (AWS Textract, Google Document AI)
- Real file storage (S3, GCS, Supabase Storage)
- Redis-based rate limiting
- Email verification flow
- MFA implementation (schema exists, logic doesn't)
- Payslip comparison UI (backend data exists, frontend not built)
- Admin user management UI
- Marginal relief on surcharge
- Capital gains or business income tax
- Gratuity calculation
- Form 12BB generation
- ITR pre-fill
