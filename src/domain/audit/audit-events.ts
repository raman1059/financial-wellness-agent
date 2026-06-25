/**
 * Audit Event Catalog
 *
 * Single source of truth for every auditable action in the system.
 *
 * Design decisions:
 *   1. AuditMetadataMap enforces the exact payload shape per action at the
 *      TypeScript call site — wrong fields are compile errors, not runtime bugs.
 *   2. Severity is deterministic per action — not a free-text field callers
 *      can get wrong. Security scans can rely on it.
 *   3. Compliance tags link actions to the specific regulations they satisfy,
 *      making it mechanical to produce evidence packs for auditors.
 *
 * Adding an event:
 *   1. Add the action string to AuditAction.
 *   2. Add its metadata shape to AuditMetadataMap.
 *   3. Add its severity to ACTION_SEVERITY.
 *   4. Add relevant compliance tags to ACTION_COMPLIANCE_TAGS.
 *   5. Add a human-readable description to ACTION_DESCRIPTIONS.
 */

// ─── Severity ─────────────────────────────────────────────────────────────────

export type AuditSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";

// ─── Action union ─────────────────────────────────────────────────────────────

export type AuditAction =
  // Auth
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILURE"
  | "AUTH_LOGOUT"
  | "AUTH_SESSION_EXPIRED"
  // Payroll
  | "PAYROLL_RECORD_READ"
  | "PAYROLL_RECORD_CREATE"
  | "PAYROLL_RECORD_UPDATE"
  | "PAYROLL_RECORD_DELETE"
  | "PAYROLL_LIST_QUERIED"
  // Documents / Payslips
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_OCR_COMPLETED"
  | "DOCUMENT_OCR_FAILED"
  | "DOCUMENT_VIEWED"
  | "DOCUMENT_DELETED"
  // AI Chat
  | "AI_QUERY_RECEIVED"
  | "AI_QUERY_COMPLETED"
  | "AI_TOOL_INVOKED"
  | "AI_REFUSAL"
  | "AI_RATE_LIMITED"
  // Tax
  | "TAX_SIMULATION_RUN"
  | "TAX_DECLARATION_VIEWED"
  | "TAX_DECLARATION_UPDATED"
  | "TAX_CHECKLIST_VIEWED"
  | "PROOF_UPLOADED"
  | "PROOF_STATUS_CHANGED"
  // Security
  | "PERMISSION_DENIED"
  | "RATE_LIMIT_EXCEEDED"
  | "SUSPICIOUS_REQUEST";

// ─── Typed metadata per action ────────────────────────────────────────────────
//
// Using a mapped type so logEvent<A extends AuditAction>(action: A, metadata: AuditMetadataMap[A])
// gives TypeScript a compile-time error for wrong/missing fields.

export interface AuditMetadataMap {
  // Auth
  AUTH_LOGIN_SUCCESS:     { method: "credentials" | "oauth"; provider?: string };
  AUTH_LOGIN_FAILURE:     { method: "credentials" | "oauth"; reason: string; email?: string };
  AUTH_LOGOUT:            Record<string, never>;
  AUTH_SESSION_EXPIRED:   Record<string, never>;

  // Payroll
  PAYROLL_RECORD_READ:    { payPeriodMonth: number; payPeriodYear: number; recordId: string };
  PAYROLL_RECORD_CREATE:  { payPeriodMonth: number; payPeriodYear: number };
  PAYROLL_RECORD_UPDATE:  { payPeriodMonth: number; payPeriodYear: number; changedFields: string[] };
  PAYROLL_RECORD_DELETE:  { payPeriodMonth: number; payPeriodYear: number };
  PAYROLL_LIST_QUERIED:   { financialYear?: string; count: number; filters: Record<string, unknown> };

  // Documents
  DOCUMENT_UPLOADED:      { fileName: string; fileSize: number; mimeType: string; fileHash: string };
  DOCUMENT_OCR_COMPLETED: { confidence: number; provider: string; durationMs: number; imputedFields: string[]; issueCount: number };
  DOCUMENT_OCR_FAILED:    { provider: string; durationMs: number; errorCount: number; topIssue: string };
  DOCUMENT_VIEWED:        { fileName: string; payPeriodMonth?: number; payPeriodYear?: number };
  DOCUMENT_DELETED:       { fileName: string };

  // AI
  AI_QUERY_RECEIVED:      { intentTags: string[]; sessionId: string; messagePreview: string };
  AI_QUERY_COMPLETED:     {
    sessionId:    string;
    intentTags:   string[];
    toolsUsed:    string[];
    inputTokens:  number;
    outputTokens: number;
    durationMs:   number;
    confidence:   string;
    isGrounded:   boolean;
    citationCount: number;
  };
  AI_TOOL_INVOKED:        { toolName: string; sessionId: string; inputSummary?: string };
  AI_REFUSAL:             { sessionId: string; refusalReason: string };
  AI_RATE_LIMITED:        { retryAfterMs: number; windowMs: number; limitPerWindow: number };

  // Tax
  TAX_SIMULATION_RUN:     { financialYear: string; regime: string; grossIncome: number; taxLiability: number; durationMs: number };
  TAX_DECLARATION_VIEWED: { financialYear: string };
  TAX_DECLARATION_UPDATED:{ financialYear: string; changedFields: string[] };
  TAX_CHECKLIST_VIEWED:   { financialYear: string; pendingCount: number; missingCount: number; actionsRequired: number; totalTaxAtRisk: number };
  PROOF_UPLOADED:         { proofType: string; fileName: string; declaredAmount: number };
  PROOF_STATUS_CHANGED:   { proofType: string; fromStatus: string; toStatus: string; reason?: string };

  // Security
  PERMISSION_DENIED:      { requiredPermission: string; callerRole: string; endpoint: string };
  RATE_LIMIT_EXCEEDED:    { limit: number; windowMs: number; retryAfterMs: number };
  SUSPICIOUS_REQUEST:     { reason: string; requestId?: string };
}

// ─── Severity map (deterministic — not a caller decision) ─────────────────────

export const ACTION_SEVERITY: Record<AuditAction, AuditSeverity> = {
  AUTH_LOGIN_SUCCESS:      "INFO",
  AUTH_LOGIN_FAILURE:      "WARN",
  AUTH_LOGOUT:             "INFO",
  AUTH_SESSION_EXPIRED:    "INFO",

  PAYROLL_RECORD_READ:     "INFO",
  PAYROLL_RECORD_CREATE:   "INFO",
  PAYROLL_RECORD_UPDATE:   "WARN",
  PAYROLL_RECORD_DELETE:   "WARN",
  PAYROLL_LIST_QUERIED:    "INFO",

  DOCUMENT_UPLOADED:       "INFO",
  DOCUMENT_OCR_COMPLETED:  "INFO",
  DOCUMENT_OCR_FAILED:     "ERROR",
  DOCUMENT_VIEWED:         "INFO",
  DOCUMENT_DELETED:        "WARN",

  AI_QUERY_RECEIVED:       "INFO",
  AI_QUERY_COMPLETED:      "INFO",
  AI_TOOL_INVOKED:         "INFO",
  AI_REFUSAL:              "WARN",
  AI_RATE_LIMITED:         "WARN",

  TAX_SIMULATION_RUN:      "INFO",
  TAX_DECLARATION_VIEWED:  "INFO",
  TAX_DECLARATION_UPDATED: "WARN",
  TAX_CHECKLIST_VIEWED:    "INFO",
  PROOF_UPLOADED:          "INFO",
  PROOF_STATUS_CHANGED:    "INFO",

  PERMISSION_DENIED:       "WARN",
  RATE_LIMIT_EXCEEDED:     "WARN",
  SUSPICIOUS_REQUEST:      "CRITICAL",
};

// ─── Compliance regulation tags ───────────────────────────────────────────────
//
// Mapping lets auditors filter logs by regulation without re-tagging by hand.
//
// DPDP   — India Digital Personal Data Protection Act 2023
//           Requires logging of access to personal financial data.
// SOC2   — SOC 2 Type II (Security + Confidentiality trust service criteria)
//           Requires evidence of access control enforcement and anomaly detection.
// ISO27001 — ISO/IEC 27001:2022 Annex A (A.8.15 Logging, A.8.16 Monitoring,
//             A.9.4 Access control, A.12.4 Logging & monitoring)

export type ComplianceRegulation = "DPDP" | "SOC2" | "ISO27001" | "GDPR";

export const ACTION_COMPLIANCE_TAGS: Partial<Record<AuditAction, ComplianceRegulation[]>> = {
  AUTH_LOGIN_SUCCESS:      ["DPDP", "SOC2", "ISO27001"],
  AUTH_LOGIN_FAILURE:      ["DPDP", "SOC2", "ISO27001"],
  AUTH_LOGOUT:             ["SOC2", "ISO27001"],
  AUTH_SESSION_EXPIRED:    ["SOC2", "ISO27001"],

  PAYROLL_RECORD_READ:     ["DPDP", "SOC2"],
  PAYROLL_RECORD_CREATE:   ["DPDP", "SOC2", "ISO27001"],
  PAYROLL_RECORD_UPDATE:   ["DPDP", "SOC2", "ISO27001"],
  PAYROLL_RECORD_DELETE:   ["DPDP", "SOC2", "ISO27001"],
  PAYROLL_LIST_QUERIED:    ["DPDP", "SOC2"],

  DOCUMENT_UPLOADED:       ["DPDP", "SOC2"],
  DOCUMENT_OCR_FAILED:     ["SOC2"],
  DOCUMENT_DELETED:        ["DPDP", "SOC2", "ISO27001"],

  AI_QUERY_COMPLETED:      ["SOC2"],
  AI_REFUSAL:              ["SOC2"],
  AI_RATE_LIMITED:         ["SOC2"],

  TAX_SIMULATION_RUN:      ["DPDP", "SOC2"],
  TAX_DECLARATION_UPDATED: ["DPDP", "SOC2", "ISO27001"],
  PROOF_STATUS_CHANGED:    ["DPDP", "SOC2"],

  PERMISSION_DENIED:       ["SOC2", "ISO27001"],
  RATE_LIMIT_EXCEEDED:     ["SOC2"],
  SUSPICIOUS_REQUEST:      ["SOC2", "ISO27001"],
};

// ─── Human-readable descriptions (shown in audit UI and incident reports) ─────

export const ACTION_DESCRIPTIONS: Record<AuditAction, string> = {
  AUTH_LOGIN_SUCCESS:      "User authenticated successfully",
  AUTH_LOGIN_FAILURE:      "Authentication attempt failed — invalid credentials",
  AUTH_LOGOUT:             "User signed out",
  AUTH_SESSION_EXPIRED:    "JWT session expired",

  PAYROLL_RECORD_READ:     "Payroll record viewed",
  PAYROLL_RECORD_CREATE:   "Payroll record created",
  PAYROLL_RECORD_UPDATE:   "Payroll record modified",
  PAYROLL_RECORD_DELETE:   "Payroll record deleted",
  PAYROLL_LIST_QUERIED:    "Payroll history list queried",

  DOCUMENT_UPLOADED:       "Payslip document uploaded",
  DOCUMENT_OCR_COMPLETED:  "Payslip OCR processing completed",
  DOCUMENT_OCR_FAILED:     "Payslip OCR processing failed",
  DOCUMENT_VIEWED:         "Document viewed",
  DOCUMENT_DELETED:        "Document deleted",

  AI_QUERY_RECEIVED:       "AI assistant query received",
  AI_QUERY_COMPLETED:      "AI assistant query completed with response",
  AI_TOOL_INVOKED:         "AI tool call executed",
  AI_REFUSAL:              "AI assistant refused to answer (grounding rule triggered)",
  AI_RATE_LIMITED:         "AI chat rate limit reached",

  TAX_SIMULATION_RUN:      "Tax saving simulation executed",
  TAX_DECLARATION_VIEWED:  "Tax declaration viewed",
  TAX_DECLARATION_UPDATED: "Tax declaration updated",
  TAX_CHECKLIST_VIEWED:    "Investment proof checklist viewed",
  PROOF_UPLOADED:          "Investment proof document uploaded",
  PROOF_STATUS_CHANGED:    "Investment proof status changed by HR",

  PERMISSION_DENIED:       "Access denied — insufficient role permissions",
  RATE_LIMIT_EXCEEDED:     "Request rate limit exceeded",
  SUSPICIOUS_REQUEST:      "Suspicious request pattern detected",
};
