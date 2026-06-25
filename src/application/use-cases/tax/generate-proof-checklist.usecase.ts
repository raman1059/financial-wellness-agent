/**
 * Generate Proof Checklist Use Case
 *
 * Takes a user's tax declaration + all submitted investment proofs and
 * produces a structured, personalised checklist that shows:
 *
 *   SUBMITTED   — proof uploaded (status: PENDING | APPROVED | NEEDS_RESUBMISSION | REJECTED)
 *   PENDING     — amount declared but no document uploaded yet
 *   ACTIONS     — proofs that need immediate attention (REJECTED / NEEDS_RESUBMISSION)
 *
 * Plus:
 *   - Tax-at-risk: estimated tax exposure if a proof is not accepted
 *   - Recommended actions with plain-language instructions
 *   - OCR mismatch warning when OCR-parsed amount ≠ declared amount
 *   - Headroom: how much more of each section cap is unused
 *   - Deadline urgency: days until employer submission cutoff
 */

import { prisma }                         from "@/infrastructure/db/prisma/client";
import { TaxBracketService }              from "@/domain/services/tax-bracket.service";
import {
  PROOF_CATALOG,
  DECLARATION_FIELD_TO_PROOF,
  type ProofType,
  type ProofCatalogEntry,
}                                         from "@/domain/services/proof-catalog";
import type { MockTaxDeclaration, MockInvestmentProof } from "../../../../mock-data";

// ─── Output types ─────────────────────────────────────────────────────────────

export type ProofStatus =
  | "APPROVED"             // verified and accepted
  | "PENDING_REVIEW"       // uploaded, awaiting HR/employer review
  | "NEEDS_RESUBMISSION"   // returned with comments
  | "REJECTED"             // rejected, may or may not be re-uploadable
  | "MISSING";             // declared but no document uploaded

export type UrgencyLevel = "HIGH" | "MEDIUM" | "LOW";

export interface ChecklistItem {
  /** Stable ID — either the proof record ID or a synthetic "decl:{field}" ID */
  id:               string;
  proofType:        ProofType;
  label:            string;
  section:          string;
  sectionLabel:     string;

  /** Amount the employee declared */
  declaredAmount:   number;
  /** Amount confirmed by OCR (null if no document yet) */
  ocrParsedAmount:  number | null;
  /** Amount approved by employer/HR (null until approved) */
  verifiedAmount:   number | null;
  /** Tax section cap (₹1.5L for 80C, etc.) */
  sectionCap:       number;
  /** Unused section capacity */
  headroom:         number;

  status:           ProofStatus;
  urgency:          UrgencyLevel;

  /** File details if a document was uploaded */
  uploadedFile: {
    fileName:     string;
    fileSizeBytes: number;
    uploadedAt:   Date;
    ocrConfidence: number | null;
  } | null;

  /** If REJECTED or NEEDS_RESUBMISSION: reason from HR */
  rejectionReason:  string | null;

  /** If OCR amount ≠ declared amount: warning text */
  ocrMismatchWarning: string | null;

  /** Estimated tax impact if this proof is NOT accepted */
  taxAtRisk:        number;

  /** What the employee should do now */
  recommendedAction: string;

  /** Catalog entry — how to obtain the document */
  howToObtain:      string;
  acceptedDocuments: string[];
  checkBefore:      string[];
}

export interface ChecklistRecommendation {
  priority:    number;          // 1 = highest
  urgency:     UrgencyLevel;
  title:       string;
  description: string;
  action:      string;
  affectedSections: string[];
  estimatedSaving:  number;     // tax saving if recommendation is acted on
}

export interface ProofChecklistSummary {
  totalDeclaredAmount: number;
  totalApprovedAmount: number;
  totalPendingAmount:  number;
  totalMissingAmount:  number;
  totalRejectedAmount: number;
  approvedCount:       number;
  pendingReviewCount:  number;
  missingCount:        number;
  rejectedCount:       number;
  needsResubmissionCount: number;
  totalTaxAtRisk:      number;
  completionPct:       number;   // (approved / total items with amount) × 100
  deadlineDate:        string;   // ISO date of employer submission cutoff
  daysToDeadline:      number;
  financialYear:       string;
  regime:              "OLD" | "NEW";
  regimeNote:          string;
}

export interface ProofChecklistResult {
  summary:        ProofChecklistSummary;
  submitted:      ChecklistItem[];   // uploaded (any review status)
  pending:        ChecklistItem[];   // missing documents
  actionsRequired: ChecklistItem[];  // REJECTED or NEEDS_RESUBMISSION
  recommendations: ChecklistRecommendation[];
}

// ─── Internal declaration field map ──────────────────────────────────────────

interface DeclaredItem {
  field:   string;
  amount:  number;
}

function extractDeclaredItems(decl: MockTaxDeclaration): DeclaredItem[] {
  return [
    { field: "ppfAmount",             amount: Number(decl.ppfAmount) },
    { field: "elssAmount",            amount: Number(decl.elssAmount) },
    { field: "lifeInsurance",         amount: Number(decl.lifeInsurance) },
    { field: "homeLoanPrincipal",     amount: Number(decl.homeLoanPrincipal) },
    { field: "nscAmount",             amount: Number(decl.nscAmount) },
    { field: "tuitionFees",           amount: Number(decl.tuitionFees) },
    { field: "other80C",              amount: Number(decl.other80C) },
    { field: "selfHealthInsurance",   amount: Number(decl.selfHealthInsurance) },
    { field: "parentHealthInsurance", amount: Number(decl.parentHealthInsurance) },
    { field: "hraReceived",           amount: Number(decl.hraReceived) },
    { field: "npsContribution",       amount: Number(decl.npsContribution) },
    { field: "homeLoanInterest",      amount: Number(decl.homeLoanInterest) },
    { field: "educationLoanInterest", amount: Number(decl.educationLoanInterest) },
  ].filter((d) => d.amount > 0);
}

// ─── Section headroom tracker ─────────────────────────────────────────────────

function computeHeadroom(
  entry:         ProofCatalogEntry,
  declaredAmount: number,
  allDeclared:   DeclaredItem[],
): number {
  if (entry.sectionCap === Infinity) return Infinity;

  if (entry.section === "80C") {
    // 80C is a combined cap across all 80C items
    const total80C = allDeclared
      .filter((d) => {
        const pt = DECLARATION_FIELD_TO_PROOF[d.field];
        return pt && PROOF_CATALOG[pt]?.section === "80C";
      })
      .reduce((s, d) => s + d.amount, 0);
    return Math.max(entry.sectionCap - total80C, 0);
  }

  return Math.max(entry.sectionCap - declaredAmount, 0);
}

// ─── Tax-at-risk estimator ────────────────────────────────────────────────────

function estimateTaxAtRisk(
  declaredAmount:  number,
  entry:           ProofCatalogEntry,
  marginalRate:    number,   // as decimal e.g. 0.30
): number {
  // Cap the at-risk amount to the section limit
  const cappedAmount = entry.sectionCap === Infinity
    ? declaredAmount
    : Math.min(declaredAmount, entry.sectionCap);

  // cess on top of marginal rate
  return Math.round(cappedAmount * marginalRate * 1.04);
}

// ─── Recommended action builder ───────────────────────────────────────────────

function buildAction(
  status: ProofStatus,
  entry:  ProofCatalogEntry,
  rejectionReason: string | null,
  ocrMismatch: boolean,
): string {
  switch (status) {
    case "APPROVED":
      return "No action needed — this proof has been verified.";

    case "PENDING_REVIEW":
      return ocrMismatch
        ? `Your proof is under review, but our system detected an amount mismatch. ` +
          `Verify the uploaded document shows the correct amount, or re-upload to avoid delays.`
        : "Your proof is awaiting HR review. No action needed unless you receive a query.";

    case "NEEDS_RESUBMISSION":
      return `HR has returned this proof${rejectionReason ? `: "${rejectionReason}"` : ""}. ` +
        `Re-upload a corrected document — ${entry.howToObtain}`;

    case "REJECTED":
      return `This proof was rejected${rejectionReason ? `: "${rejectionReason}"` : ""}. ` +
        `If you believe this is incorrect, contact your HR / accounts team. ` +
        `Otherwise, the deduction may not be applied to your payroll TDS calculation.`;

    case "MISSING":
      return `Upload your ${entry.label}. ${entry.howToObtain}`;

    default:
      return entry.howToObtain;
  }
}

// ─── OCR mismatch warning ─────────────────────────────────────────────────────

function buildOcrMismatchWarning(
  proof: MockInvestmentProof,
  label: string,
): string | null {
  if (!proof.ocrParsedAmount) return null;
  const declared = Number(proof.declaredAmount);
  const parsed   = Number(proof.ocrParsedAmount);
  const diff     = Math.abs(declared - parsed);
  if (diff <= 100) return null; // within ₹100 — ignore rounding

  return (
    `The amount on your uploaded ${label} (₹${parsed.toLocaleString("en-IN")}) ` +
    `differs from your declaration (₹${declared.toLocaleString("en-IN")}) ` +
    `by ₹${diff.toLocaleString("en-IN")}. ` +
    `Please verify the document is correct before HR reviews it.`
  );
}

// ─── Urgency level ────────────────────────────────────────────────────────────

function computeUrgency(
  status:        ProofStatus,
  taxAtRisk:     number,
  daysToDeadline: number,
): UrgencyLevel {
  if (status === "REJECTED" || status === "NEEDS_RESUBMISSION") return "HIGH";
  if (status === "MISSING" && taxAtRisk > 10_000) return "HIGH";
  if (status === "MISSING" && daysToDeadline <= 14) return "HIGH";
  if (status === "MISSING") return "MEDIUM";
  if (status === "PENDING_REVIEW" && daysToDeadline <= 7) return "MEDIUM";
  return "LOW";
}

// ─── Global recommendations ───────────────────────────────────────────────────

function buildRecommendations(
  pending:        ChecklistItem[],
  actionsRequired: ChecklistItem[],
  decl:           MockTaxDeclaration,
  marginalRate:   number,
  daysToDeadline: number,
): ChecklistRecommendation[] {
  const recs: ChecklistRecommendation[] = [];

  // R1 — Fix rejected/resubmission proofs immediately
  if (actionsRequired.length > 0) {
    const totalAtRisk = actionsRequired.reduce((s, i) => s + i.taxAtRisk, 0);
    recs.push({
      priority: 1,
      urgency:  "HIGH",
      title:    `${actionsRequired.length} proof(s) need immediate action`,
      description:
        `${actionsRequired.length} uploaded proof(s) were rejected or returned for correction. ` +
        `If not resolved before the deadline, the related deductions will not apply to your TDS. ` +
        `Estimated tax impact: ₹${totalAtRisk.toLocaleString("en-IN")}.`,
      action: "Review each item in the 'Action Required' list and re-upload corrected documents.",
      affectedSections: [...new Set(actionsRequired.map((i) => i.section))],
      estimatedSaving:  totalAtRisk,
    });
  }

  // R2 — Upload missing proofs
  if (pending.length > 0) {
    const totalAtRisk = pending.reduce((s, i) => s + i.taxAtRisk, 0);
    recs.push({
      priority: 2,
      urgency:  daysToDeadline <= 14 ? "HIGH" : "MEDIUM",
      title:    `Upload ${pending.length} missing proof(s) before deadline`,
      description:
        `You have declared amounts for ${pending.length} investment(s) but have not yet ` +
        `uploaded the supporting documents. Without proofs, these deductions may not be ` +
        `applied by your employer. Estimated tax at risk: ₹${totalAtRisk.toLocaleString("en-IN")}.`,
      action:
        daysToDeadline <= 14
          ? `Deadline is ${daysToDeadline} days away — upload proofs immediately.`
          : "Upload documents at your earliest convenience to avoid last-minute delays.",
      affectedSections: [...new Set(pending.map((i) => i.section))],
      estimatedSaving:  totalAtRisk,
    });
  }

  // R3 — 80C headroom (if under-utilised and FY still open)
  const total80C = Number(decl.ppfAmount) + Number(decl.elssAmount) +
    Number(decl.lifeInsurance) + Number(decl.homeLoanPrincipal) +
    Number(decl.nscAmount) + Number(decl.tuitionFees) + Number(decl.other80C);
  const headroom80C = Math.max(1_50_000 - total80C, 0);

  if (headroom80C >= 10_000 && decl.taxRegime === "OLD") {
    const potentialSaving = Math.round(headroom80C * marginalRate * 1.04);
    recs.push({
      priority: 3,
      urgency:  "LOW",
      title:    `₹${headroom80C.toLocaleString("en-IN")} of 80C limit unused`,
      description:
        `Your current 80C investments total ₹${total80C.toLocaleString("en-IN")} against a ` +
        `₹1,50,000 cap. Investing the remaining ₹${headroom80C.toLocaleString("en-IN")} ` +
        `before 31 March could save approximately ₹${potentialSaving.toLocaleString("en-IN")} in tax.`,
      action:
        "Consider PPF (safe, 15-year lock-in) or ELSS (market-linked, 3-year lock-in) " +
        "to utilise the remaining 80C limit.",
      affectedSections: ["80C"],
      estimatedSaving:  potentialSaving,
    });
  }

  // R4 — NPS headroom (if under-utilised under Old Regime)
  if (decl.taxRegime === "OLD") {
    const npsHeadroom = Math.max(50_000 - Number(decl.npsContribution), 0);
    if (npsHeadroom >= 10_000) {
      const potentialSaving = Math.round(npsHeadroom * marginalRate * 1.04);
      recs.push({
        priority: 4,
        urgency:  "LOW",
        title:    `₹${npsHeadroom.toLocaleString("en-IN")} of NPS 80CCD(1B) limit unused`,
        description:
          `You can invest up to ₹50,000 more in NPS Tier-1 u/s 80CCD(1B) — this is ` +
          `OVER and ABOVE the ₹1,50,000 80C cap. Potential saving: ₹${potentialSaving.toLocaleString("en-IN")}.`,
        action:
          "Open an NPS Tier-1 account at enps.nsdl.com or through your bank. " +
          "Contributions must be made before 31 March.",
        affectedSections: ["80CCD(1B)"],
        estimatedSaving:  potentialSaving,
      });
    }
  }

  // R5 — New Regime note (proofs still needed for employer Form 12BB)
  if (decl.taxRegime === "NEW") {
    recs.push({
      priority: 5,
      urgency:  "LOW",
      title:    "New Regime: proofs still required for employer payroll processing",
      description:
        "You are on the New Regime, so most deductions (80C, 80D, HRA) don't apply for tax computation. " +
        "However, your employer still needs submitted proofs for salary processing and Form 12BB. " +
        "Consider switching to Old Regime before 31 March if your deductions exceed New Regime benefits.",
      action:
        "Submit all proofs to your employer as requested, even under New Regime. " +
        "Run a regime comparison on the Tax Estimate page to see which saves more tax.",
      affectedSections: [],
      estimatedSaving:  0,
    });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}

// ─── Use case ──────────────────────────────────────────────────────────────────

export class GenerateProofChecklistUseCase {
  private readonly taxService = new TaxBracketService();

  async execute(userId: string, financialYear: string): Promise<ProofChecklistResult> {
    // ── Fetch declaration with proofs ────────────────────────────────────────
    const decl = await prisma.taxDeclaration.findFirst({
      where: { userId, financialYear },
      include: { investmentProofs: true },
    });

    // ── Employer submission deadline (31 January of the calendar year the FY ends) ─
    const [, fyEnd]    = financialYear.split("-").map(Number);
    const deadlineYear = 2000 + fyEnd;
    const deadlineDate = new Date(`${deadlineYear}-01-31`);
    const today        = new Date();
    const daysToDeadline = Math.max(
      Math.ceil((deadlineDate.getTime() - today.getTime()) / 86_400_000),
      0,
    );

    // ── If no declaration: return empty checklist ────────────────────────────
    if (!decl) {
      return {
        summary: {
          totalDeclaredAmount: 0, totalApprovedAmount: 0, totalPendingAmount: 0,
          totalMissingAmount: 0, totalRejectedAmount: 0,
          approvedCount: 0, pendingReviewCount: 0, missingCount: 0,
          rejectedCount: 0, needsResubmissionCount: 0,
          totalTaxAtRisk: 0, completionPct: 0,
          deadlineDate: deadlineDate.toISOString().split("T")[0],
          daysToDeadline,
          financialYear,
          regime: "NEW",
          regimeNote:
            "No tax declaration found for this financial year. " +
            "Go to Tax Estimate to create one.",
        },
        submitted: [], pending: [], actionsRequired: [], recommendations: [],
      };
    }

    const proofs: MockInvestmentProof[] = decl.investmentProofs ?? [];

    // ── Build proof lookup by proofType ──────────────────────────────────────
    const proofByType = new Map<string, MockInvestmentProof>();
    for (const p of proofs) {
      proofByType.set(p.proofType, p);
    }

    // ── Compute marginal tax rate ────────────────────────────────────────────
    const taxableIncome = Number(decl.taxableIncome);
    const regime        = decl.taxRegime as "OLD" | "NEW";
    const baseTax       = this.taxService.computeTax(taxableIncome, regime, financialYear);
    // Marginal rate: tax on taxableIncome vs taxableIncome + 1L (rough approximation)
    const taxOnExtraLakh = this.taxService.computeTax(taxableIncome + 1_00_000, regime, financialYear);
    const marginalRate   = Math.max((taxOnExtraLakh - baseTax) / 1_00_000, 0);

    // ── Declared items ───────────────────────────────────────────────────────
    const declaredItems = extractDeclaredItems(decl);

    const submitted:        ChecklistItem[] = [];
    const pending:          ChecklistItem[] = [];
    const actionsRequired:  ChecklistItem[] = [];

    for (const { field, amount } of declaredItems) {
      const proofType = DECLARATION_FIELD_TO_PROOF[field];
      if (!proofType) continue;

      const entry        = PROOF_CATALOG[proofType];
      const proof        = proofByType.get(proofType) ?? null;
      const headroom     = computeHeadroom(entry, amount, declaredItems);
      const taxAtRisk    = estimateTaxAtRisk(amount, entry, marginalRate);

      let   status:          ProofStatus;
      let   uploadedFile:    ChecklistItem["uploadedFile"] = null;
      let   rejectionReason: string | null = null;
      let   ocrMismatch:     string | null = null;

      if (!proof) {
        status = "MISSING";
      } else {
        uploadedFile = {
          fileName:      proof.fileName,
          fileSizeBytes: proof.fileSizeBytes,
          uploadedAt:    proof.createdAt,
          ocrConfidence: proof.ocrConfidence,
        };
        rejectionReason = proof.rejectionReason;
        ocrMismatch     = buildOcrMismatchWarning(proof, entry.label);

        switch (proof.status) {
          case "APPROVED":            status = "APPROVED";            break;
          case "PENDING":             status = "PENDING_REVIEW";      break;
          case "NEEDS_RESUBMISSION":  status = "NEEDS_RESUBMISSION";  break;
          case "REJECTED":            status = "REJECTED";            break;
          default:                    status = "PENDING_REVIEW";
        }
      }

      const urgency = computeUrgency(status, taxAtRisk, daysToDeadline);

      const item: ChecklistItem = {
        id:                 proof?.id ?? `decl:${field}`,
        proofType,
        label:              entry.label,
        section:            entry.section,
        sectionLabel:       entry.sectionLabel,
        declaredAmount:     amount,
        ocrParsedAmount:    proof?.ocrParsedAmount ?? null,
        verifiedAmount:     proof?.verifiedAmount ?? null,
        sectionCap:         entry.sectionCap,
        headroom,
        status,
        urgency,
        uploadedFile,
        rejectionReason,
        ocrMismatchWarning: ocrMismatch,
        taxAtRisk,
        recommendedAction:  buildAction(status, entry, rejectionReason, !!ocrMismatch),
        howToObtain:        entry.howToObtain,
        acceptedDocuments:  entry.acceptedDocuments,
        checkBefore:        entry.checkBefore,
      };

      if (status === "MISSING") {
        pending.push(item);
      } else if (status === "REJECTED" || status === "NEEDS_RESUBMISSION") {
        actionsRequired.push(item);
        submitted.push(item);       // also appears in submitted (it was uploaded)
      } else {
        submitted.push(item);
      }
    }

    // Sort by urgency then tax-at-risk
    const urgencyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const sortFn = (a: ChecklistItem, b: ChecklistItem) =>
      urgencyOrder[a.urgency] - urgencyOrder[b.urgency] ||
      b.taxAtRisk - a.taxAtRisk;

    submitted.sort(sortFn);
    pending.sort(sortFn);
    actionsRequired.sort(sortFn);

    // ── Summary ──────────────────────────────────────────────────────────────
    const totalItems = declaredItems.length;
    const approvedItems  = submitted.filter((i) => i.status === "APPROVED");
    const pendingReview  = submitted.filter((i) => i.status === "PENDING_REVIEW");
    const rejected       = actionsRequired.filter((i) => i.status === "REJECTED");
    const needsResub     = actionsRequired.filter((i) => i.status === "NEEDS_RESUBMISSION");
    const completionPct  = totalItems > 0
      ? Math.round((approvedItems.length / totalItems) * 100)
      : 100;

    const summary: ProofChecklistSummary = {
      totalDeclaredAmount: declaredItems.reduce((s, d) => s + d.amount, 0),
      totalApprovedAmount:  approvedItems.reduce((s, i) => s + i.declaredAmount, 0),
      totalPendingAmount:   pendingReview.reduce((s, i) => s + i.declaredAmount, 0),
      totalMissingAmount:   pending.reduce((s, i) => s + i.declaredAmount, 0),
      totalRejectedAmount:  rejected.reduce((s, i) => s + i.declaredAmount, 0),
      approvedCount:        approvedItems.length,
      pendingReviewCount:   pendingReview.length,
      missingCount:         pending.length,
      rejectedCount:        rejected.length,
      needsResubmissionCount: needsResub.length,
      totalTaxAtRisk: [...pending, ...actionsRequired]
        .reduce((s, i) => s + i.taxAtRisk, 0),
      completionPct,
      deadlineDate:    deadlineDate.toISOString().split("T")[0],
      daysToDeadline,
      financialYear,
      regime,
      regimeNote:
        regime === "NEW"
          ? "New Regime selected — 80C and 80D deductions don't reduce your taxable income, " +
            "but proofs are still required for employer Form 12BB processing."
          : "Old Regime selected — all declared deductions will reduce your taxable income " +
            "once proofs are approved by your employer.",
    };

    // ── Recommendations ──────────────────────────────────────────────────────
    const recommendations = buildRecommendations(
      pending, actionsRequired, decl, marginalRate, daysToDeadline,
    );

    return { summary, submitted, pending, actionsRequired, recommendations };
  }
}
