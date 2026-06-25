# Financial Wellness & Tax AI Agent

> A secure, AI-powered financial wellness assistant for Indian salaried employees — grounded in actual payroll records and uploaded payslip documents.

---

## Problem Statement

Design and implement a secure AI-powered financial wellness assistant that helps employees understand their salary structure, deductions, reimbursements, year-to-date payroll values, and basic tax-saving opportunities. The solution analyses both structured payroll data and uploaded payslip documents, then provides document-grounded explanations in simple, employee-friendly language.

---

## Business Context

Employees frequently find payslips difficult to interpret because salary components, statutory deductions, reimbursements, tax deductions, and year-to-date values are presented in a compact and technical format. This creates repeated queries for Payroll, HR, and Finance teams — especially around **HRA, LTA, PF, professional tax, TDS, reimbursements, and investment proof submissions**.

This system reduces that operational load by providing:
- Instant, personalised, document-aware responses
- Strict user-level privacy for sensitive financial information
- A demonstration of how AI can be safely applied in an internal employee-finance context where **trust, correctness, and privacy are critical**

---

## Live Demo

```
URL:      http://localhost:3000
Email:    demo@example.com
Password: demo1234
```

No environment variables are required to run the demo. All data is served from an in-memory mock. The AI advisor works in demo mode without an Anthropic API key.

---

## How to Run

### Prerequisites

```bash
node --version   # must be >= 18.0.0
# If on Node 12/14/16, upgrade via nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc   # or ~/.bash_profile
nvm install 20
nvm use 20
```

### Quick Start (zero env vars needed)

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/financial-wellness-agent.git
cd financial-wellness-agent

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev

# 4. Open http://localhost:3000
# Login with: demo@example.com / demo1234
```

### With Live AI (optional)

```bash
# Copy the env template
cp .env.example .env.local

# Add your Anthropic API key to .env.local
ANTHROPIC_API_KEY=sk-ant-...

# Restart the dev server
npm run dev
```

### With a Real Database (optional)

```bash
# Add to .env.local
DATABASE_URL=postgresql://postgres:password@localhost:5432/financial_wellness
DIRECT_URL=postgresql://postgres:password@localhost:5432/financial_wellness

# Apply migrations and seed
npm run db:migrate
npm run db:seed
```

### All Available Scripts

```bash
npm run dev          # Start development server on http://localhost:3000
npm run build        # Production build
npm run start        # Serve production build
npm run lint         # ESLint check
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:migrate   # Apply database migrations
npm run db:seed      # Seed demo data to the database
npm run db:studio    # Open Prisma Studio GUI
```

---

## Technology Stack

### Framework & Language

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 15 | Full-stack framework — App Router, RSC, Server Actions |
| **TypeScript** | 5 (strict) | End-to-end type safety |
| **React** | 19 | UI components |
| **Tailwind CSS** | 3 | Styling |

### AI & Document Processing

| Technology | Purpose |
|---|---|
| **Anthropic Claude** (`claude-sonnet-4-6`) | AI assistant — tool-use loop for grounded answers |
| **`@anthropic-ai/sdk`** | Anthropic API client |
| **Vercel AI SDK** | Streaming response helpers |
| **Custom OCR pipeline** | 8-step: Classify → Extract → Normalize → Impute → Validate → Score |
| **Inngest** | Background job processing for async OCR |

### Auth, Data & Validation

| Technology | Purpose |
|---|---|
| **Auth.js v5** (NextAuth) | JWT sessions — Credentials + Google OAuth |
| **Prisma 6** | ORM + schema (PostgreSQL in production) |
| **`mock-data.ts`** | In-memory mock Prisma — zero-database local dev |
| **Zod** | Runtime schema validation for all API surfaces |
| **bcryptjs** | Password hashing (production) |

### UI & State

| Technology | Purpose |
|---|---|
| **TanStack Query** | Server state + caching |
| **Zustand** | Client state |
| **React Hook Form** | Form management |
| **Recharts** | Payroll and tax charts |
| **Lucide React** | Icon system |
| **Pino** | Structured logging (pino-pretty in dev) |

---

## Scope & Constraints (Addressed)

| Constraint | How This Project Handles It |
|---|---|
| Mock/simulated payroll records | `mock-data.ts` — full in-memory dataset (27 payroll records, 4 proofs, 12 audit events) |
| Mock/simulated OCR | `mock-ocr.engine.ts` — realistic confidence scores and field extraction without external service |
| No production-grade tax compliance | Tax logic uses simplified Indian slab tables; assumptions are explicitly documented in every response |
| Simulated identity provider | Auth.js v5 with Credentials provider; JWT session; mock user table |
| Any technology stack | Next.js 15 full-stack (web UI + REST API) |

---

## Functional Requirements — Implementation Map

### 1. Payslip Upload (PDF / Image)

- **Route:** `POST /api/documents/upload`
- **Processor:** `src/infrastructure/ocr/document-processor.ts`
- **8-step OCR pipeline:**
  ```
  Step 1  Classify   — detect PDF vs image vs JSON mock
  Step 2  Extract    — raw text extraction per format
  Step 3  Normalize  — currency symbols, date formats, whitespace
  Step 4  Fields     — regex + heuristic field extraction
  Step 5  Impute     — derive missing fields (e.g. gross = basic + HRA + special)
  Step 6  Validate   — cross-field consistency checks
  Step 7  Score      — per-field and overall OCR confidence
  Step 8  Return     — structured result with issues[] and imputedFields[]
  ```
- **Duplicate detection:** SHA-256 file hash prevents re-upload of same document
- **Status tracking:** `PENDING → PROCESSING → PARSED → VERIFIED`
- **OCR confidence:** Field-level confidence flags low-quality extractions

### 2. Payslip Fields Extracted

| Component | Field Name | Indian Formula |
|---|---|---|
| Basic Salary | `basicSalary` | Base pay |
| HRA | `hra` | Employer-provided |
| LTA | `lta` | Leave Travel Allowance |
| Special Allowance | `specialAllowance` | Residual component |
| Gross Pay | `grossSalary` | basic + hra + special + lta |
| Provident Fund | `providentFund` | 12% of basic |
| Professional Tax | `professionalTax` | State-wise slab |
| TDS / Income Tax | `tdsDeducted` | Employer-deducted |
| ESIC | `esic` | If applicable |
| Net Pay | `netSalary` | gross − totalDeductions |
| YTD values | Available via `/api/payroll/ytd` | Aggregated across months |

### 3. Document-Grounded AI Questions

The AI assistant answers questions like:
- *"Why is my net salary lower this month?"*
- *"How much HRA did I receive?"*
- *"What deductions were applied?"*
- *"Compare my salary this month vs last month"*

**Grounding architecture:**

```
User question
  → Intent classifier (payroll / tax / documents / ytd / general)
  → Minimal tool allowlist (prevents hallucination surface)
  → Tool calls: get_payroll_history / get_payslip_data / get_tax_estimate / get_ytd_summary
  → Grounding service: every ₹ figure must cite [source:TOOL_ID:FIELD_NAME]
  → If rupee figures present but not grounded → REFUSED (not fabricated)
  → Confidence: high / medium / low / refused
```

**Hallucination prevention:**
- Tool-before-numbers rule: no monetary claim without a tool result citation
- "Tier 0" (Claude training data) explicitly forbidden in system prompt
- 7 named failure modes the model is instructed to avoid
- Hard refusal gate in grounding service when `hasRupees && !isGrounded`

### 4. Structured Payroll Data Queries

- **Monthly breakdown:** `GET /api/payroll/:id`
- **List with filters:** `GET /api/payroll?fy=2024-25`
- **YTD summary:** `GET /api/payroll/ytd?fy=2024-25`

Returns: gross, basic, HRA, deductions, TDS, net — both monthly and accumulated.

### 5. Tax-Saving Simulations

**Tax Estimate** (`GET /api/tax/estimate?fy=2024-25`):
- Old Regime vs New Regime side-by-side comparison
- 87A rebate, surcharge, 4% cess applied
- Standard deduction: ₹75,000 (New), ₹50,000 (Old)

**What-If Simulator** (`POST /api/tax/simulate`):
```json
{
  "financialYear": "2024-25",
  "baseline": { "ppf": 50000, "lifeInsurance": 25000 },
  "scenarios": [
    { "section": "80C_ELSS", "label": "Add ELSS SIP", "additionalAmount": 30000 },
    { "section": "NPS",      "label": "Open NPS Tier-1", "additionalAmount": 50000 }
  ]
}
```

Returns per-scenario: estimated tax saving, marginal rate, post-tax cost, headroom remaining.

**Supported sections:** `80C_PPF`, `80C_ELSS`, `80C_LIC`, `NPS` (80CCD 1B), `80D_SELF`, `80D_PARENT`

### 6. Salary Component Explanations

The AI assistant uses a 12-term payroll glossary embedded in the system prompt:

| Term | Plain-language explanation |
|---|---|
| Basic | Fixed base pay; forms the basis for PF, gratuity, HRA calculation |
| HRA | House Rent Allowance — partly or fully exempt from tax if you pay rent |
| LTA | Leave Travel Allowance — tax-exempt for actual travel expenses twice in 4 years |
| Special Allowance | Residual component — fully taxable, no exemption |
| PF | 12% of basic deducted + 12% matched by employer → your retirement corpus |
| PT | Professional Tax — state government levy (up to ₹2,500/year) |
| TDS | Tax Deducted at Source — employer deposits income tax on your behalf monthly |
| Net | Take-home pay = Gross − PF − PT − TDS − other deductions |

### 7. Investment Proof Checklist

`GET /api/tax/checklist?fy=2024-25`

Generates a personalised checklist from the employee's tax declaration and submitted proofs:

| Status | Meaning |
|---|---|
| APPROVED | Verified by HR — deduction will apply |
| PENDING_REVIEW | Uploaded, awaiting HR review |
| NEEDS_RESUBMISSION | Returned with rejection reason; OCR mismatch highlighted |
| REJECTED | Full rejection with guidance on correction |
| MISSING | Amount declared, no document uploaded yet |

Each item includes:
- `taxAtRisk` — estimated tax exposure if proof not accepted
- `recommendedAction` — plain-language next step
- `howToObtain` — where to download the document
- `acceptedDocuments[]` — exactly what HR accepts
- `daysToDeadline` — urgency indicator
- OCR mismatch warning when parsed amount ≠ declared amount

**13 proof types supported:** PPF Statement, ELSS Statement, LIC Premium, Home Loan Principal, NSC Certificate, Tuition Fee Receipt, Other 80C, Health Insurance (Self), Health Insurance (Parents), Rent Receipt, NPS Statement, Home Loan Interest Certificate, Education Loan Certificate.

### 8. AI Grounding Rules

Enforced via `src/infrastructure/ai/prompts/system.prompt.ts` (353 lines):

- **G-1:** No monetary figure without a tool result citation — period
- **G-2:** Never reuse figures from a previous conversation turn
- **G-3:** When data is partial, name the missing months/records explicitly
- **G-4:** Imputed fields must be labelled "estimated" with the formula
- **G-5:** Conflicting data sources → report the conflict, don't resolve silently
- **G-6:** Refusal must name the specific gap and the specific remedy — never vague

---

## Security & Privacy

### How User Identity Works

1. **Authentication:** Auth.js v5 with JWT strategy. Login issues a signed JWT containing `userId` and `role`.
2. **Session:** JWT validated on every request via Auth.js `auth()` helper. No session database required.
3. **Identity source:** `userId` in every handler comes **only from the verified JWT** — never from the request body, query string, or path parameters.

### How Cross-User Data Leakage is Prevented

Four independent layers:

```
Layer 1 — middleware.ts (Next.js Edge Middleware)
  Redirects unauthenticated requests before they reach any handler.

Layer 2 — withPermission() HOF
  Checks RBAC permission before handler executes.
  If role doesn't hold the permission → 403 logged to audit trail.

Layer 3 — assertOwnership()  (src/lib/auth/ownership.ts)
  After fetching a resource, verifies resource.userId === session.userId.
  If mismatch → 404 (deliberately not 403, to avoid ID enumeration).

Layer 4 — Scoped DB queries
  Every query includes WHERE userId = session.user.id.
  An ADMIN fetching "any user" data still scopes to an explicit userId parameter.
```

### RBAC Permission Matrix

| Permission | USER | ACCOUNTANT | ADMIN |
|---|:---:|:---:|:---:|
| `payroll:read:own` | ✓ | ✓ | ✓ |
| `payroll:read:any` | | ✓ | ✓ |
| `payroll:write:own` | ✓ | | ✓ |
| `payroll:delete:own` | ✓ | | ✓ |
| `documents:read:own` | ✓ | ✓ | ✓ |
| `documents:write:own` | ✓ | | ✓ |
| `tax:read:own` | ✓ | ✓ | ✓ |
| `tax:simulate` | ✓ | | ✓ |
| `chat:use` | ✓ | | ✓ |
| `audit:read` | | ✓ | ✓ |
| `users:manage` | | | ✓ |

### Sensitive Data Handling

- Passwords: bcryptjs (10 rounds) in production; plain text in mock (demo only — flagged in code)
- PAN / Aadhaar: AES-256-GCM field encryption via `src/lib/encryption/field-cipher.ts`
- Payslip files: stored with UUID-based keys; never exposed via user-controlled paths
- AI tools: scoped per-userId — Claude cannot call a tool for a different user's data

---

## Architecture

### Clean Architecture Layers

```
┌───────────────────────────────────────────────────────────────────┐
│  PRESENTATION  (app/)                                             │
│  Next.js pages, API route handlers, React components              │
│  Dependencies: Application layer, Auth.js, Next.js                │
├───────────────────────────────────────────────────────────────────┤
│  APPLICATION  (src/application/)                                  │
│  Use-cases, Services, DTOs                                         │
│  Dependencies: Domain layer only                                  │
├───────────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE  (src/infrastructure/)                            │
│  Prisma repos, Anthropic client, OCR engine, Storage, Audit       │
│  Dependencies: Domain layer, external SDKs                        │
├───────────────────────────────────────────────────────────────────┤
│  DOMAIN  (src/domain/)                                            │
│  Entities, Value Objects, Repository interfaces, Domain services   │
│  Dependencies: NONE — pure TypeScript, zero framework imports      │
└───────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
financial-wellness-agent/
│
├── app/                              Next.js App Router
│   ├── (auth)/login/page.tsx         Login form
│   ├── (auth)/register/page.tsx      Registration
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx        Payroll snapshot + AI digest
│   │   ├── payroll/page.tsx          Payroll history + YTD
│   │   ├── payroll/[id]/page.tsx     Monthly detail view
│   │   ├── documents/page.tsx        Payslip vault
│   │   ├── documents/upload/page.tsx Upload interface with OCR status
│   │   ├── tax/estimate/page.tsx     Old vs New regime comparison
│   │   ├── tax/deductions/page.tsx   AI deduction finder
│   │   └── chat/page.tsx             AI advisor (streaming chat)
│   └── api/
│       ├── audit/route.ts            GET  — query audit logs
│       ├── chat/route.ts             POST — AI assistant
│       ├── documents/route.ts        GET  — list payslips
│       ├── documents/upload/         POST — upload + OCR
│       ├── documents/[id]/           GET / DELETE
│       ├── payroll/route.ts          GET list / POST create
│       ├── payroll/[id]/             GET / PATCH / DELETE
│       ├── payroll/ytd/              GET  — YTD aggregates
│       ├── tax/estimate/             GET  — tax simulation
│       ├── tax/simulate/             POST — what-if scenarios
│       └── tax/checklist/            GET  — proof checklist
│
├── src/
│   ├── domain/                       Pure business logic
│   │   ├── audit/audit-events.ts     27 typed audit actions + compliance tags
│   │   ├── entities/                 PayrollRecord entity with validation
│   │   ├── repositories/             IPayrollRepository, IAuditLogRepository
│   │   ├── services/
│   │   │   ├── tax-bracket.service.ts   Progressive slab computation (FY 2024-26)
│   │   │   ├── tax-deduction.service.ts 80C / 80D / NPS / HRA / 24b / 80E
│   │   │   └── proof-catalog.ts         13 proof types with metadata
│   │   └── value-objects/            Money, PayPeriod, Reimbursement
│   │
│   ├── application/                  Use-case orchestration
│   │   ├── services/
│   │   │   ├── audit.service.ts      logEvent<A>() — compile-time typed events
│   │   │   ├── confidence-scorer.ts  high / medium / low / refused
│   │   │   ├── grounding.service.ts  Citation extraction + refusal gate
│   │   │   └── payroll.service.ts    Payroll CRUD with audit
│   │   └── use-cases/
│   │       ├── documents/upload-payslip.usecase.ts
│   │       ├── payroll/create + get-summary
│   │       └── tax/
│   │           ├── run-tax-simulation.usecase.ts
│   │           ├── simulate-tax-savings.usecase.ts
│   │           └── generate-proof-checklist.usecase.ts
│   │
│   ├── infrastructure/               All I/O
│   │   ├── ai/
│   │   │   ├── context-builder.ts    User snapshot → enriched system prompt
│   │   │   ├── intent-classifier.ts  Tag routing → minimal tool set
│   │   │   ├── prompts/system.prompt.ts  Anti-hallucination system prompt
│   │   │   └── tools/                get_payroll_history / get_tax_estimate
│   │   │                             get_payslip_data / get_ytd_summary
│   │   ├── ocr/                      8-step document processing pipeline
│   │   ├── repositories/             Prisma implementations
│   │   └── storage/mock-storage.ts
│   │
│   └── lib/                          Cross-cutting concerns
│       ├── auth/rbac.ts              Role → Permission[] map
│       ├── auth/ownership.ts         assertOwnership() — cross-user guard
│       ├── middleware/with-auth.ts   withAuth / withPermission / withRoles
│       ├── middleware/request-context.ts  IP / UA / requestId extraction
│       ├── rate-limiter.ts           In-process sliding window (20 req/min)
│       └── validation/schemas/       Zod schemas for all inputs
│
├── mock-data.ts                      In-memory Prisma mock — all demo data
├── middleware.ts                     Edge Middleware — route protection
└── prisma/schema.prisma              9 models, full indexes, all enums
```

---

## Database Schema

9 Prisma models. Every table has a denormalised `userId` column for efficient row-level filtering.

```
User            → id, email, passwordHash, role (ADMIN|USER|ACCOUNTANT), mfaEnabled
Employee        → userId, designation, department, employerName, residentialState
PayrollRecord   → userId, payPeriod(Month/Year), basicSalary, hra, lta,
                  providentFund, professionalTax, tdsDeducted, netSalary
                  @@unique([employeeId, payPeriodMonth, payPeriodYear])
Payslip         → userId, fileHash (dedupe), status, ocrConfidence, parsedFields (JSON)
TaxDeclaration  → userId, financialYear, taxRegime, all deduction fields,
                  taxableIncome, estimatedTaxLiability, taxPayable
                  @@unique([employeeId, financialYear])
InvestmentProof → taxDeclarationId, proofType, declaredAmount, ocrParsedAmount,
                  status (PENDING|APPROVED|REJECTED|NEEDS_RESUBMISSION), rejectionReason
ChatSession     → userId, isActive, contextPayload, tokenCounts
ChatMessage     → sessionId, role, content, citations (JSON), isGrounded, confidenceScore
AuditLog        → userId, action (enum), resourceType, resourceId,
                  metadata (JSON), ipAddress, userAgent, requestId, success
```

---

## Audit Logging

### 27 Typed Events Across 6 Domains

| Domain | Events | Severity |
|---|---|---|
| Auth | `AUTH_LOGIN_SUCCESS/FAILURE`, `AUTH_LOGOUT` | INFO / WARN |
| Payroll | `PAYROLL_RECORD_READ/CREATE/UPDATE/DELETE`, `PAYROLL_LIST_QUERIED` | INFO / WARN |
| Documents | `DOCUMENT_UPLOADED`, `DOCUMENT_OCR_COMPLETED/FAILED`, `DOCUMENT_VIEWED/DELETED` | INFO / WARN / ERROR |
| AI Chat | `AI_QUERY_RECEIVED/COMPLETED`, `AI_TOOL_INVOKED`, `AI_REFUSAL`, `AI_RATE_LIMITED` | INFO / WARN |
| Tax | `TAX_SIMULATION_RUN`, `TAX_CHECKLIST_VIEWED`, `TAX_DECLARATION_UPDATED`, `PROOF_UPLOADED/STATUS_CHANGED` | INFO / WARN |
| Security | `PERMISSION_DENIED`, `RATE_LIMIT_EXCEEDED`, `SUSPICIOUS_REQUEST` | WARN / CRITICAL |

### Compliance Tags

Each action maps to the regulations it satisfies:
- **DPDP 2023** — Every `PAYROLL_*` and `DOCUMENT_*` action proves purpose-limited access to personal data
- **SOC 2 Type II** — `PERMISSION_DENIED` events prove RBAC enforcement; `AI_REFUSAL` proves AI safety controls fired
- **ISO 27001 A.8.15** — All WARN/ERROR/CRITICAL events feed monitoring thresholds

### Queryable Audit API

```bash
# All failed login attempts (ADMIN / ACCOUNTANT only)
GET /api/audit?action=AUTH_LOGIN_FAILURE&success=false

# All payroll access by a specific user
GET /api/audit?action=PAYROLL_RECORD_READ&userId=user_demo_001

# WARN+ events for SOC 2 evidence pack
GET /api/audit?severity=WARN&from=2025-01-01&to=2025-03-31

# All DPDP-tagged events
GET /api/audit?regulation=DPDP

# AI queries where grounding failed
GET /api/audit?action=AI_REFUSAL
```

---

## Tax Engine

### Supported Financial Years

| FY | Regime | Key Change |
|---|---|---|
| 2024-25 | New | Standard deduction ₹75,000 (Budget 2024 amendment) |
| 2024-25 | Old | Standard deduction ₹50,000 |
| 2025-26 | New | New slabs + ₹12L rebate threshold (Budget 2025) |
| 2025-26 | Old | Unchanged from 2024-25 |

### FY 2024-25 Slab Tables (New Regime)

| Income Range | Rate |
|---|---|
| Up to ₹3,00,000 | 0% |
| ₹3,00,001 – ₹7,00,000 | 5% |
| ₹7,00,001 – ₹10,00,000 | 10% |
| ₹10,00,001 – ₹12,00,000 | 15% |
| ₹12,00,001 – ₹15,00,000 | 20% |
| Above ₹15,00,000 | 30% |

87A rebate: full rebate if taxable income ≤ ₹7,00,000 (New) / ₹5,00,000 (Old).  
Surcharge: 10% (>₹50L), 15% (>₹1Cr), 25% (>₹2Cr, New regime capped here), 37% (>₹5Cr, Old only).  
Cess: 4% on (slab tax + surcharge).

---

## Environment Variables

| Variable | Required For | How to Generate |
|---|---|---|
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | Production | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Production | Your deployment URL |
| `ANTHROPIC_API_KEY` | Live AI responses | console.anthropic.com |
| `DATABASE_URL` | Real database | Neon / Supabase / Railway |
| `DIRECT_URL` | DB migrations | Same DB, non-pooled URL |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth | console.cloud.google.com |
| `FIELD_ENCRYPTION_KEY` | PAN/Aadhaar encryption | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `INNGEST_EVENT_KEY/SIGNING_KEY` | Background jobs | app.inngest.com |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Production rate limiting | upstash.com |

None of these are required for the local demo.

---

## Mocked Data (Demo)

Pre-seeded in `mock-data.ts`:

| Entity | Count | Notes |
|---|---|---|
| Users | 1 | `demo@example.com` / `demo1234`, role: USER |
| Employees | 1 | Senior Software Engineer, TechCorp India, Mumbai |
| Payroll Records | 27 | Apr 2024 – Jun 2026 with salary increments |
| Payslips | 2 | One VERIFIED (97% confidence), one PARSED (88%) |
| Tax Declaration | 1 | FY 2024-25, New Regime |
| Investment Proofs | 4 | APPROVED (PPF), PENDING (LIC), REJECTED (ELSS), NEEDS_RESUBMISSION (Health Insurance) |
| Chat Sessions | 1 | With 2 sample messages |
| Audit Logs | 12 | Covering all event types for demo |

---

## Edge Cases & Test Scenarios

### Payslip / OCR Edge Cases

| Scenario | Handling |
|---|---|
| Missing gross salary field | Imputed: `gross = basic + hra + specialAllowance` (flagged as `imputedFields`) |
| OCR confidence < 70% | Warning returned in API response; AI tool emits `dataQualityWarning` |
| Duplicate file upload | SHA-256 hash check → returns existing ID with `isDuplicate: true` |
| Non-payslip document uploaded | Classifier rejects in Step 1 with `CLASSIFICATION_FAILED` |
| Inconsistent net pay | Validator flags when `gross - deductions ≠ netSalary` by >₹100 |
| Month missing from YTD | AI explicitly names which months are missing; refuses to extrapolate |

### Authorization Edge Cases

| Scenario | Handling |
|---|---|
| No session cookie | 401 before handler executes (middleware + withAuth) |
| Valid session, wrong userId in path | `assertOwnership()` returns 404 (not 403, to prevent ID enumeration) |
| ACCOUNTANT accessing `tax:simulate` | 403 logged to audit trail with `requiredPermission` |
| Rate limit hit (>20 AI req/min) | 429 with `Retry-After` header; `AI_RATE_LIMITED` audit event |
| Expired JWT | Next.js middleware redirects to `/login` |

### AI / Grounding Edge Cases

| Scenario | Handling |
|---|---|
| No payroll records exist | Snapshot tells Claude: "0 records" → Claude asks user to add data |
| User asks about another employee's salary | Tool calls are scoped to `userId` — cannot access other users' data |
| AI generates ₹ figure without tool call | Grounding service intercepts → refuses response, returns `confidence: "refused"` |
| AI references prior conversation data | G-2 rule: never reuse figures from a previous turn without re-calling the tool |
| Tool returns empty result | AI explicitly states "no data found" and suggests uploading documents |
| Imputed fields in tool result | AI must label imputed values as "estimated" with the formula used |

### Tax Simulation Edge Cases

| Scenario | Handling |
|---|---|
| Income below rebate threshold | 87A rebate applies → tax = ₹0; `rebateApplied: true` |
| Income above ₹50L (surcharge) | Progressive surcharge applied before cess |
| New Regime selected but 80C declared | Simulator computes Old Regime savings and recommends switching |
| Additional investment exceeds section cap | Capped at limit; headroom shown as ₹0 |
| `financialYear: "2024-25"` parsed wrongly | Fixed: `split("-").map(Number)` → [2024, 25], `fyEndYear = fyStartYear + 1` (not `2000 + 25`) |

---

## Bonus Features Implemented

All optional bonus items from the case study are implemented:

| Bonus | Implementation |
|---|---|
| **Payslip comparison across months** | YTD endpoint (`/api/payroll/ytd`) + monthly comparison in AI chat via `get_payroll_history` tool |
| **Source-cited answers** | Field-level citation format `[source:TOOL_USE_ID:FIELD_NAME]`; displayed as source cards in UI |
| **Step-by-step calculation explainability** | Tax simulation returns `slabTax`, `surcharge`, `cess`, `rebateApplied` with formulae; AI explains each line |
| **Audit logging** | 27 typed events, `GET /api/audit` query endpoint, 3 compliance regulation mappings |
| **Role-based admin/payroll view** | `ACCOUNTANT` role: read-any payroll data + audit logs without write access or chat access |

---

## Known Limitations

1. **OCR is mocked** — The `mock-ocr.engine.ts` returns realistic but simulated field extraction. Production would use AWS Textract, Google Document AI, or Azure Form Recognizer.

2. **Rate limiting is in-process** — The sliding window uses a `Map<string, {count, windowEnd}>` in Node.js memory. This resets on server restart and doesn't work across multiple replicas. Replace with Redis (Upstash) for production.

3. **Tax calculations are simplified** — Marginal relief on surcharge, gratuity exemption, capital gains, and business income are not modelled. Always verify with a CA before filing ITR.

4. **No real file storage** — `mock-storage.ts` stores references only. Production requires S3 / GCS / Supabase Storage.

5. **AI response is non-streamed in tool-use mode** — The tool-use loop completes synchronously before streaming begins. True delta streaming requires Anthropic's streaming API with manual buffer management.

6. **Inngest jobs are not active locally** — Background OCR jobs are defined but not triggered in demo mode; OCR runs synchronously in the upload use-case instead.

7. **No email verification** — Registration does not send a verification email. The `emailVerified` field exists in the schema for future use.

---

## Deployment

### Vercel (recommended)

```bash
npm i -g vercel
vercel deploy
```

Set environment variables in the Vercel dashboard. `NEXTAUTH_URL` must match your deployment URL exactly.

### Required Production Variables

```env
NEXTAUTH_URL=https://your-app.vercel.app
AUTH_SECRET=<openssl rand -base64 32>
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Security Disclaimer

This application is a **prototype / demonstration** of how AI can be applied to employee financial data. It is not certified for production use without:

- A formal security audit
- Production-grade encryption at rest and in transit
- Regulatory compliance review (DPDP 2023, IT Act)
- Regular penetration testing

---

## Tax Disclaimer

Tax calculations are estimates for planning and educational purposes only, based on simplified assumptions about Indian Income Tax Act provisions. They do not constitute financial, tax, or legal advice. Always verify with a qualified Chartered Accountant before filing your Income Tax Return (ITR).

---

## License

MIT
