/**
 * mock-data.ts — Single source of truth for all demo data.
 *
 * Replaces PostgreSQL + Prisma entirely for local development.
 * No database, no migrations, no env vars required to run the app.
 *
 * Demo credentials:  demo@example.com / demo1234
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MockUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  passwordPlain: string;       // plain text — demo only, never do this in production
  role: "ADMIN" | "USER" | "ACCOUNTANT";
  emailVerified: Date | null;
  mfaEnabled: boolean;
  mfaSecret: null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockEmployee {
  id: string;
  userId: string;
  employeeCode: string | null;
  designation: string | null;
  department: string | null;
  employmentType: "SALARIED" | "SELF_EMPLOYED" | "CONTRACT" | "FREELANCE";
  employerName: string | null;
  employerPan: null;
  employerTan: null;
  panNumber: null;
  aadhaarLast4: string | null;
  dateOfBirth: Date | null;
  dateOfJoining: Date | null;
  dateOfLeaving: Date | null;
  residentialState: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockPayrollRecord {
  id: string;
  employeeId: string;
  userId: string;
  payPeriodMonth: number;
  payPeriodYear: number;
  basicSalary: number;
  hra: number;
  specialAllowance: number;
  lta: number;
  medicalAllowance: number;
  otherEarnings: number;
  grossSalary: number;
  providentFund: number;
  professionalTax: number;
  tdsDeducted: number;
  esic: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  payslipId: string | null;
  isVerified: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockPayslip {
  id: string;
  employeeId: string;
  userId: string;
  fileName: string;
  fileKey: string;
  fileMimeType: string;
  fileSizeBytes: number;
  fileHash: string;
  status: "PENDING" | "PROCESSING" | "PARSED" | "VERIFIED" | "FAILED";
  ocrProvider: string | null;
  ocrConfidence: number | null;
  ocrRawText: string | null;
  parsedFields: Record<string, unknown> | null;
  parseErrors: unknown[] | null;
  payPeriodMonth: number | null;
  payPeriodYear: number | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockInvestmentProof {
  id: string;
  taxDeclarationId: string;
  userId: string;
  proofType: string;
  description: string | null;
  declaredAmount: number;
  verifiedAmount: number | null;
  fileName: string;
  fileKey: string;
  fileMimeType: string;
  fileSizeBytes: number;
  fileHash: string;
  ocrParsedAmount: number | null;
  ocrConfidence: number | null;
  ocrRawText: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_RESUBMISSION";
  rejectionReason: string | null;
  verifiedAt: Date | null;
  verifiedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockTaxDeclaration {
  id: string;
  employeeId: string;
  userId: string;
  financialYear: string;
  taxRegime: "OLD" | "NEW";
  ppfAmount: number;
  elssAmount: number;
  lifeInsurance: number;
  homeLoanPrincipal: number;
  nscAmount: number;
  tuitionFees: number;
  other80C: number;
  total80C: number;
  selfHealthInsurance: number;
  parentHealthInsurance: number;
  hraReceived: number;
  hraExempt: number;
  npsContribution: number;
  homeLoanInterest: number;
  educationLoanInterest: number;
  grossIncome: number;
  standardDeduction: number;
  totalDeductions: number;
  taxableIncome: number;
  estimatedTaxLiability: number;
  totalTdsPaid: number;
  taxPayable: number;
  isSubmitted: boolean;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  investmentProofs?: MockInvestmentProof[];
}

export interface MockChatSession {
  id: string;
  userId: string;
  title: string | null;
  isActive: boolean;
  contextPayload: Record<string, unknown> | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  citations: unknown[] | null;
  toolCalls: unknown[] | null;
  toolResults: unknown[] | null;
  isGrounded: boolean;
  confidenceScore: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
}

export interface MockAuditLog {
  id: string;
  userId: string | null;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  success: boolean;
  errorCode: string | null;
  createdAt: Date;
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const USER_ID = "user_demo_001";
const EMP_ID  = "emp_demo_001";
const TAX_ID  = "tax_demo_001";
const SES_ID  = "ses_demo_001";

const users: MockUser[] = [
  {
    id: USER_ID,
    email: "demo@example.com",
    name: "Arpit Tiwari",
    image: null,
    passwordPlain: "demo1234",
    role: "USER",
    emailVerified: new Date("2024-01-01"),
    mfaEnabled: false,
    mfaSecret: null,
    deletedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },
];

const employees: MockEmployee[] = [
  {
    id: EMP_ID,
    userId: USER_ID,
    employeeCode: "EMP-001",
    designation: "Senior Software Engineer",
    department: "Engineering",
    employmentType: "SALARIED",
    employerName: "TechCorp India Pvt Ltd",
    employerPan: null,
    employerTan: null,
    panNumber: null,
    aadhaarLast4: null,
    dateOfBirth: null,
    dateOfJoining: new Date("2022-04-01"),
    dateOfLeaving: null,
    residentialState: "IN-MH",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },
];

function makePayroll(month: number, year: number, basic: number, hra: number, special: number, tds: number): MockPayrollRecord {
  const gross = basic + hra + special;
  const pf = Math.round(basic * 0.12);
  const profTax = 200;
  const totalDed = pf + profTax + tds;
  return {
    id: `pr_${year}_${String(month).padStart(2, "0")}`,
    employeeId: EMP_ID,
    userId: USER_ID,
    payPeriodMonth: month,
    payPeriodYear: year,
    basicSalary: basic,
    hra,
    specialAllowance: special,
    lta: 0,
    medicalAllowance: 0,
    otherEarnings: 0,
    grossSalary: gross,
    providentFund: pf,
    professionalTax: profTax,
    tdsDeducted: tds,
    esic: 0,
    otherDeductions: 0,
    totalDeductions: totalDed,
    netSalary: gross - totalDed,
    payslipId: null,
    isVerified: true,
    verifiedAt: new Date(`${year}-${String(month).padStart(2, "0")}-28`),
    createdAt: new Date(`${year}-${String(month).padStart(2, "0")}-28`),
    updatedAt: new Date(`${year}-${String(month).padStart(2, "0")}-28`),
  };
}

const payrollRecords: MockPayrollRecord[] = [
  makePayroll(4, 2024, 85000, 34000, 21000, 12500),
  makePayroll(5, 2024, 85000, 34000, 21000, 12500),
  makePayroll(6, 2024, 85000, 34000, 21000, 12500),
  makePayroll(7, 2024, 85000, 34000, 21000, 12500),
  makePayroll(8, 2024, 85000, 34000, 21000, 12500),
  makePayroll(9, 2024, 90000, 36000, 25000, 14500),
  makePayroll(10, 2024, 90000, 36000, 25000, 14500),
  makePayroll(11, 2024, 90000, 36000, 25000, 14500),
  makePayroll(12, 2024, 90000, 36000, 25000, 14500),
  makePayroll(1, 2025, 90000, 36000, 25000, 14500),
  makePayroll(2, 2025, 90000, 36000, 25000, 14500),
  makePayroll(3, 2025, 90000, 36000, 25000, 14500),
  makePayroll(4, 2025, 95000, 38000, 27000, 16000),
  makePayroll(5, 2025, 95000, 38000, 27000, 16000),
  makePayroll(6, 2025, 95000, 38000, 27000, 16000),
  makePayroll(7, 2025, 95000, 38000, 27000, 16000),
  makePayroll(8, 2025, 95000, 38000, 27000, 16000),
  makePayroll(9, 2025, 100000, 40000, 30000, 18000),
  makePayroll(10, 2025, 100000, 40000, 30000, 18000),
  makePayroll(11, 2025, 100000, 40000, 30000, 18000),
  makePayroll(12, 2025, 100000, 40000, 30000, 18000),
  makePayroll(1, 2026, 100000, 40000, 30000, 18000),
  makePayroll(2, 2026, 100000, 40000, 30000, 18000),
  makePayroll(3, 2026, 100000, 40000, 30000, 18000),
  makePayroll(4, 2026, 105000, 42000, 33000, 20000),
  makePayroll(5, 2026, 105000, 42000, 33000, 20000),
  makePayroll(6, 2026, 105000, 42000, 33000, 20000),
];

const investmentProofs: MockInvestmentProof[] = [
  {
    id: "proof_001",
    taxDeclarationId: TAX_ID,
    userId: USER_ID,
    proofType: "PPF_STATEMENT",
    description: "PPF Account Statement FY 2024-25",
    declaredAmount: 50000,
    verifiedAmount: 50000,
    fileName: "ppf_statement_2024_25.pdf",
    fileKey: `${USER_ID}/ppf_statement.pdf`,
    fileMimeType: "application/pdf",
    fileSizeBytes: 245760,
    fileHash: "abc123def456",
    ocrParsedAmount: 50000,
    ocrConfidence: 0.97,
    ocrRawText: null,
    status: "APPROVED",
    rejectionReason: null,
    verifiedAt: new Date("2025-01-15"),
    verifiedByUserId: null,
    createdAt: new Date("2025-01-10"),
    updatedAt: new Date("2025-01-15"),
  },
  {
    id: "proof_002",
    taxDeclarationId: TAX_ID,
    userId: USER_ID,
    proofType: "LIFE_INSURANCE_PREMIUM",
    description: "LIC Premium Receipt",
    declaredAmount: 25000,
    verifiedAmount: null,
    fileName: "lic_receipt_2024_25.pdf",
    fileKey: `${USER_ID}/lic_receipt.pdf`,
    fileMimeType: "application/pdf",
    fileSizeBytes: 102400,
    fileHash: "xyz789abc012",
    ocrParsedAmount: 25000,
    ocrConfidence: 0.91,
    ocrRawText: null,
    status: "PENDING",
    rejectionReason: null,
    verifiedAt: null,
    verifiedByUserId: null,
    createdAt: new Date("2025-01-12"),
    updatedAt: new Date("2025-01-12"),
  },
  {
    // ELSS proof rejected — OCR detected wrong FY on the statement
    id: "proof_003",
    taxDeclarationId: TAX_ID,
    userId: USER_ID,
    proofType: "ELSS_STATEMENT",
    description: "ELSS Statement — Zerodha",
    declaredAmount: 30000,
    verifiedAmount: null,
    fileName: "elss_zerodha_2024_25.pdf",
    fileKey: `${USER_ID}/elss_zerodha.pdf`,
    fileMimeType: "application/pdf",
    fileSizeBytes: 89600,
    fileHash: "elss003hash",
    ocrParsedAmount: 30000,
    ocrConfidence: 0.82,
    ocrRawText: null,
    status: "REJECTED",
    rejectionReason:
      "Document shows transactions for FY 2023-24, not FY 2024-25. " +
      "Please upload the statement with investment dates between 01-Apr-2024 and 31-Mar-2025.",
    verifiedAt: null,
    verifiedByUserId: null,
    createdAt: new Date("2025-01-08"),
    updatedAt: new Date("2025-01-18"),
  },
  {
    // Health insurance proof returned for resubmission — policy expired mid-year
    id: "proof_004",
    taxDeclarationId: TAX_ID,
    userId: USER_ID,
    proofType: "HEALTH_INS_SELF",
    description: "Star Health Insurance — Self & Family",
    declaredAmount: 20000,
    verifiedAmount: null,
    fileName: "health_ins_self_2024_25.pdf",
    fileKey: `${USER_ID}/health_ins_self.pdf`,
    fileMimeType: "application/pdf",
    fileSizeBytes: 134217,
    fileHash: "health004hash",
    ocrParsedAmount: 18500,    // OCR picked up a different amount — mismatch triggers warning
    ocrConfidence: 0.78,
    ocrRawText: null,
    status: "NEEDS_RESUBMISSION",
    rejectionReason:
      "Policy renewal receipt not included — the uploaded document only covers " +
      "Apr 2024 to Sep 2024. Please upload the renewal certificate showing coverage " +
      "through 31-Mar-2025, or provide two separate receipts.",
    verifiedAt: null,
    verifiedByUserId: null,
    createdAt: new Date("2025-01-09"),
    updatedAt: new Date("2025-01-20"),
  },
];

// YTD figures for FY 2024-25 (Apr 2024 – Mar 2025)
const fy2425Gross = payrollRecords
  .filter((r) =>
    (r.payPeriodYear === 2024 && r.payPeriodMonth >= 4) ||
    (r.payPeriodYear === 2025 && r.payPeriodMonth <= 3),
  )
  .reduce((s, r) => s + r.grossSalary, 0);

const fy2425Tds = payrollRecords
  .filter((r) =>
    (r.payPeriodYear === 2024 && r.payPeriodMonth >= 4) ||
    (r.payPeriodYear === 2025 && r.payPeriodMonth <= 3),
  )
  .reduce((s, r) => s + r.tdsDeducted, 0);

const taxDeclarations: MockTaxDeclaration[] = [
  {
    id: TAX_ID,
    employeeId: EMP_ID,
    userId: USER_ID,
    financialYear: "2024-25",
    taxRegime: "NEW",
    ppfAmount: 50000,
    elssAmount: 30000,
    lifeInsurance: 25000,
    homeLoanPrincipal: 0,
    nscAmount: 0,
    tuitionFees: 0,
    other80C: 0,
    total80C: 105000,
    selfHealthInsurance: 20000,
    parentHealthInsurance: 0,
    hraReceived: 34000,
    hraExempt: 20000,
    npsContribution: 0,
    homeLoanInterest: 0,
    educationLoanInterest: 0,
    grossIncome: fy2425Gross,
    standardDeduction: 50000,
    totalDeductions: 50000,            // New regime: only standard deduction
    taxableIncome: fy2425Gross - 50000,
    estimatedTaxLiability: 0,          // computed on first visit by use-case
    totalTdsPaid: fy2425Tds,
    taxPayable: 0 - fy2425Tds,
    isSubmitted: false,
    submittedAt: null,
    createdAt: new Date("2024-04-01"),
    updatedAt: new Date(),
    investmentProofs,
  },
];

const payslips: MockPayslip[] = [
  {
    id: "slip_001",
    employeeId: EMP_ID,
    userId: USER_ID,
    fileName: "payslip_june_2025.pdf",
    fileKey: `${USER_ID}/payslip_june_2025.pdf`,
    fileMimeType: "application/pdf",
    fileSizeBytes: 184320,
    fileHash: "hash_slip_001",
    status: "VERIFIED",
    ocrProvider: "textract",
    ocrConfidence: 0.97,
    ocrRawText: null,
    parsedFields: { grossSalary: 160000, netSalary: 133300, tdsDeducted: 16000 },
    parseErrors: null,
    payPeriodMonth: 6,
    payPeriodYear: 2025,
    processedAt: new Date("2025-06-30"),
    createdAt: new Date("2025-06-30"),
    updatedAt: new Date("2025-06-30"),
  },
  {
    id: "slip_002",
    employeeId: EMP_ID,
    userId: USER_ID,
    fileName: "payslip_may_2025.pdf",
    fileKey: `${USER_ID}/payslip_may_2025.pdf`,
    fileMimeType: "application/pdf",
    fileSizeBytes: 179200,
    fileHash: "hash_slip_002",
    status: "PARSED",
    ocrProvider: "tesseract",
    ocrConfidence: 0.88,
    ocrRawText: null,
    parsedFields: { grossSalary: 160000, netSalary: 133300, tdsDeducted: 16000 },
    parseErrors: null,
    payPeriodMonth: 5,
    payPeriodYear: 2025,
    processedAt: new Date("2025-05-31"),
    createdAt: new Date("2025-05-31"),
    updatedAt: new Date("2025-05-31"),
  },
];

const chatSessions: MockChatSession[] = [
  {
    id: SES_ID,
    userId: USER_ID,
    title: "Tax planning for FY 2024-25",
    isActive: true,
    contextPayload: { financialYear: "2024-25" },
    totalInputTokens: 420,
    totalOutputTokens: 310,
    lastMessageAt: new Date("2025-06-20"),
    createdAt: new Date("2025-06-20"),
    updatedAt: new Date("2025-06-20"),
  },
];

const chatMessages: MockChatMessage[] = [
  {
    id: "msg_001",
    sessionId: SES_ID,
    userId: USER_ID,
    role: "USER",
    content: "What is my estimated tax liability for FY 2024-25?",
    citations: null,
    toolCalls: null,
    toolResults: null,
    isGrounded: true,
    confidenceScore: null,
    inputTokens: 40,
    outputTokens: null,
    createdAt: new Date("2025-06-20T10:00:00"),
  },
  {
    id: "msg_002",
    sessionId: SES_ID,
    userId: USER_ID,
    role: "ASSISTANT",
    content:
      "Based on your payroll records, your gross income for FY 2024-25 is ₹12,84,000. Under the New Regime, after the ₹50,000 standard deduction, your taxable income is ₹12,34,000. Your estimated tax liability is ₹1,11,256 and you have ₹1,50,000 TDS already deducted — giving you a refund of ₹38,744.",
    citations: [
      { recordId: TAX_ID, table: "tax_declarations", field: "grossIncome", value: "12,84,000" },
      { recordId: TAX_ID, table: "tax_declarations", field: "taxableIncome", value: "12,34,000" },
    ],
    toolCalls: null,
    toolResults: null,
    isGrounded: true,
    confidenceScore: 0.96,
    inputTokens: 380,
    outputTokens: 310,
    createdAt: new Date("2025-06-20T10:00:05"),
  },
];

const auditLogs: MockAuditLog[] = [
  // ── Login events ─────────────────────────────────────────────────────────────
  {
    id: "al_001", userId: USER_ID, actorId: null,
    action: "AUTH_LOGIN_SUCCESS", resourceType: "User", resourceId: USER_ID,
    metadata: { method: "credentials", _severity: "INFO" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_001",
    success: true, errorCode: null, createdAt: new Date("2025-01-20T09:01:00"),
  },
  {
    id: "al_002", userId: null, actorId: null,
    action: "AUTH_LOGIN_FAILURE", resourceType: "User", resourceId: null,
    metadata: { method: "credentials", reason: "Invalid password", email: "demo@example.com", _severity: "WARN" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_002",
    success: false, errorCode: "INVALID_CREDENTIALS", createdAt: new Date("2025-01-20T08:58:00"),
  },

  // ── Payroll access ────────────────────────────────────────────────────────────
  {
    id: "al_003", userId: USER_ID, actorId: null,
    action: "PAYROLL_LIST_QUERIED", resourceType: "PayrollRecord", resourceId: null,
    metadata: { financialYear: "2024-25", count: 12, filters: { fy: "2024-25" }, _severity: "INFO" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_003",
    success: true, errorCode: null, createdAt: new Date("2025-01-20T09:05:00"),
  },
  {
    id: "al_004", userId: USER_ID, actorId: null,
    action: "PAYROLL_RECORD_READ", resourceType: "PayrollRecord", resourceId: "pr_2024_09",
    metadata: { payPeriodMonth: 9, payPeriodYear: 2024, recordId: "pr_2024_09", _severity: "INFO" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_004",
    success: true, errorCode: null, createdAt: new Date("2025-01-20T09:05:30"),
  },

  // ── Payslip upload ────────────────────────────────────────────────────────────
  {
    id: "al_005", userId: USER_ID, actorId: null,
    action: "DOCUMENT_UPLOADED", resourceType: "Payslip", resourceId: "slip_001",
    metadata: { fileName: "payslip_june_2025.pdf", fileSize: 184320, mimeType: "application/pdf", fileHash: "hash_slip_001", _severity: "INFO" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_005",
    success: true, errorCode: null, createdAt: new Date("2025-06-30T11:00:00"),
  },
  {
    id: "al_006", userId: USER_ID, actorId: null,
    action: "DOCUMENT_OCR_COMPLETED", resourceType: "Payslip", resourceId: "slip_001",
    metadata: { confidence: 0.97, provider: "textract", durationMs: 2340, imputedFields: [], issueCount: 0, _severity: "INFO" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_005",
    success: true, errorCode: null, createdAt: new Date("2025-06-30T11:00:02"),
  },

  // ── AI queries ────────────────────────────────────────────────────────────────
  {
    id: "al_007", userId: USER_ID, actorId: null,
    action: "AI_QUERY_RECEIVED", resourceType: "ChatSession", resourceId: "ses_demo_001",
    metadata: { intentTags: ["tax"], sessionId: "ses_demo_001", messagePreview: "What is my estimated tax liab", _severity: "INFO" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_007",
    success: true, errorCode: null, createdAt: new Date("2025-06-20T10:00:00"),
  },
  {
    id: "al_008", userId: USER_ID, actorId: null,
    action: "AI_QUERY_COMPLETED", resourceType: "ChatSession", resourceId: "ses_demo_001",
    metadata: {
      sessionId: "ses_demo_001", intentTags: ["tax"],
      toolsUsed: ["get_tax_estimate", "get_payroll_history"],
      inputTokens: 380, outputTokens: 310, durationMs: 4210,
      confidence: "high", isGrounded: true, citationCount: 2, _severity: "INFO",
    },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_007",
    success: true, errorCode: null, createdAt: new Date("2025-06-20T10:00:05"),
  },

  // ── Tax simulation ────────────────────────────────────────────────────────────
  {
    id: "al_009", userId: USER_ID, actorId: null,
    action: "TAX_SIMULATION_RUN", resourceType: "TaxDeclaration", resourceId: "tax_demo_001",
    metadata: { financialYear: "2024-25", regime: "NEW", grossIncome: 1757000, taxLiability: 210184, durationMs: 12, _severity: "INFO" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_009",
    success: true, errorCode: null, createdAt: new Date("2025-01-20T09:10:00"),
  },

  // ── Proof checklist ───────────────────────────────────────────────────────────
  {
    id: "al_010", userId: USER_ID, actorId: null,
    action: "TAX_CHECKLIST_VIEWED", resourceType: "TaxDeclaration", resourceId: "tax_demo_001",
    metadata: { financialYear: "2024-25", pendingCount: 1, missingCount: 1, actionsRequired: 2, totalTaxAtRisk: 39000, _severity: "INFO" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_010",
    success: true, errorCode: null, createdAt: new Date("2025-01-20T09:12:00"),
  },

  // ── Permission denial ─────────────────────────────────────────────────────────
  {
    id: "al_011", userId: USER_ID, actorId: null,
    action: "PERMISSION_DENIED", resourceType: "Api", resourceId: "/api/audit",
    metadata: { requiredPermission: "audit:read", callerRole: "USER", endpoint: "/api/audit", _severity: "WARN" },
    ipAddress: "103.24.65.12", userAgent: "Mozilla/5.0 Chrome/124", requestId: "req_011",
    success: false, errorCode: "FORBIDDEN", createdAt: new Date("2025-01-20T09:15:00"),
  },

  // ── Rate limit hit ────────────────────────────────────────────────────────────
  {
    id: "al_012", userId: USER_ID, actorId: null,
    action: "AI_RATE_LIMITED", resourceType: "ChatSession", resourceId: null,
    metadata: { retryAfterMs: 45000, windowMs: 60000, limitPerWindow: 20, _severity: "WARN" },
    ipAddress: "103.24.65.12", userAgent: "PostmanRuntime/7.36", requestId: "req_012",
    success: false, errorCode: "RATE_LIMITED", createdAt: new Date("2025-03-01T14:30:00"),
  },
];

// ─── Utility ──────────────────────────────────────────────────────────────────

let _seq = 1000;
function cuid(): string {
  return `mock_${Date.now()}_${++_seq}`;
}

type Where = Record<string, unknown>;

function matchesWhere(record: Record<string, unknown>, where: Where): boolean {
  for (const [key, val] of Object.entries(where)) {
    if (key === "OR") {
      const clauses = val as Where[];
      if (!clauses.some((c) => matchesWhere(record, c))) return false;
      continue;
    }
    if (key === "AND") {
      const clauses = val as Where[];
      if (!clauses.every((c) => matchesWhere(record, c))) return false;
      continue;
    }
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const cmp = val as Record<string, number>;
      const rv = record[key] as number;
      if ("gte" in cmp && rv < cmp.gte) return false;
      if ("lte" in cmp && rv > cmp.lte) return false;
      if ("gt" in cmp && rv <= cmp.gt) return false;
      if ("lt" in cmp && rv >= cmp.lt) return false;
      if ("equals" in cmp && rv !== cmp.equals) return false;
      continue;
    }
    if (record[key] !== val) return false;
  }
  return true;
}

function applyWhere<T extends Record<string, unknown>>(arr: T[], where?: Where): T[] {
  if (!where) return arr;
  return arr.filter((r) => matchesWhere(r, where));
}

function applyOrderBy<T extends Record<string, unknown>>(
  arr: T[],
  orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>,
): T[] {
  if (!orderBy) return arr;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...arr].sort((a, b) => {
    for (const order of orders) {
      for (const [key, dir] of Object.entries(order)) {
        const av = a[key] as number | string | Date;
        const bv = b[key] as number | string | Date;
        if (av < bv) return dir === "asc" ? -1 : 1;
        if (av > bv) return dir === "asc" ? 1 : -1;
      }
    }
    return 0;
  });
}

// ─── Mock Prisma Client ───────────────────────────────────────────────────────

export const mockPrisma = {
  // ── user ──────────────────────────────────────────────────────────────────
  user: {
    async findUnique(args: { where: Where; select?: Where }): Promise<MockUser | null> {
      return applyWhere(users as Record<string, unknown>[], args.where)[0] as MockUser ?? null;
    },
    async create(args: { data: Partial<MockUser> & { email: string; role?: string } }): Promise<MockUser> {
      const now = new Date();
      const user: MockUser = {
        id: cuid(),
        email: args.data.email,
        name: args.data.name ?? null,
        image: null,
        passwordPlain: (args.data as { passwordHash?: string }).passwordHash ?? "",
        role: (args.data.role as MockUser["role"]) ?? "USER",
        emailVerified: null,
        mfaEnabled: false,
        mfaSecret: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      users.push(user);
      return user;
    },
  },

  // ── employee ──────────────────────────────────────────────────────────────
  employee: {
    async findUnique(args: { where: Where }): Promise<MockEmployee | null> {
      return applyWhere(employees as Record<string, unknown>[], args.where)[0] as MockEmployee ?? null;
    },
    async create(args: { data: Partial<MockEmployee> & { userId: string } }): Promise<MockEmployee> {
      const now = new Date();
      const emp: MockEmployee = {
        id: cuid(),
        userId: args.data.userId,
        employeeCode: args.data.employeeCode ?? null,
        designation: args.data.designation ?? null,
        department: args.data.department ?? null,
        employmentType: args.data.employmentType ?? "SALARIED",
        employerName: args.data.employerName ?? null,
        employerPan: null,
        employerTan: null,
        panNumber: null,
        aadhaarLast4: null,
        dateOfBirth: null,
        dateOfJoining: null,
        dateOfLeaving: null,
        residentialState: null,
        createdAt: now,
        updatedAt: now,
      };
      employees.push(emp);
      return emp;
    },
  },

  // ── payrollRecord ─────────────────────────────────────────────────────────
  payrollRecord: {
    async findMany(args?: {
      where?: Where;
      orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>;
      take?: number;
      select?: Where;
    }): Promise<MockPayrollRecord[]> {
      let result = applyWhere(payrollRecords as Record<string, unknown>[], args?.where) as MockPayrollRecord[];
      result = applyOrderBy(result as Record<string, unknown>[], args?.orderBy) as MockPayrollRecord[];
      if (args?.take) result = result.slice(0, args.take);
      return result;
    },
    async findFirst(args: { where: Where }): Promise<MockPayrollRecord | null> {
      return applyWhere(payrollRecords as Record<string, unknown>[], args.where)[0] as MockPayrollRecord ?? null;
    },
    async findUnique(args: {
      where: Where | { employeeId_payPeriodMonth_payPeriodYear: { employeeId: string; payPeriodMonth: number; payPeriodYear: number } };
    }): Promise<MockPayrollRecord | null> {
      const compound = (args.where as Record<string, unknown>)["employeeId_payPeriodMonth_payPeriodYear"] as
        | { employeeId: string; payPeriodMonth: number; payPeriodYear: number }
        | undefined;
      if (compound) {
        return (
          payrollRecords.find(
            (r) =>
              r.employeeId === compound.employeeId &&
              r.payPeriodMonth === compound.payPeriodMonth &&
              r.payPeriodYear === compound.payPeriodYear,
          ) ?? null
        );
      }
      return applyWhere(payrollRecords as Record<string, unknown>[], args.where as Where)[0] as MockPayrollRecord ?? null;
    },
    async create(args: { data: Omit<MockPayrollRecord, "id" | "createdAt" | "updatedAt"> }): Promise<MockPayrollRecord> {
      const now = new Date();
      const record: MockPayrollRecord = { id: cuid(), ...args.data, createdAt: now, updatedAt: now };
      payrollRecords.push(record);
      return record;
    },
    async update(args: { where: Where; data: Partial<MockPayrollRecord> }): Promise<MockPayrollRecord> {
      const idx = (payrollRecords as Record<string, unknown>[]).findIndex((r) => matchesWhere(r, args.where));
      if (idx === -1) throw new Error("PayrollRecord not found");
      Object.assign(payrollRecords[idx], args.data, { updatedAt: new Date() });
      return payrollRecords[idx];
    },
    async deleteMany(args: { where: Where }): Promise<{ count: number }> {
      const before = payrollRecords.length;
      const keep = applyWhere(payrollRecords as Record<string, unknown>[], args.where);
      payrollRecords.length = 0;
      payrollRecords.push(...(keep as MockPayrollRecord[]));
      return { count: before - payrollRecords.length };
    },
    async count(args?: { where?: Where }): Promise<number> {
      return applyWhere(payrollRecords as Record<string, unknown>[], args?.where).length;
    },
  },

  // ── payslip ───────────────────────────────────────────────────────────────
  payslip: {
    async findMany(args?: {
      where?: Where;
      orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>;
      take?: number;
    }): Promise<MockPayslip[]> {
      let result = applyWhere(payslips as Record<string, unknown>[], args?.where) as MockPayslip[];
      result = applyOrderBy(result as Record<string, unknown>[], args?.orderBy) as MockPayslip[];
      if (args?.take) result = result.slice(0, args.take);
      return result;
    },
    async findFirst(args: { where: Where }): Promise<MockPayslip | null> {
      return applyWhere(payslips as Record<string, unknown>[], args.where)[0] as MockPayslip ?? null;
    },
    async create(args: { data: Omit<MockPayslip, "id" | "createdAt" | "updatedAt"> }): Promise<MockPayslip> {
      const now = new Date();
      const slip: MockPayslip = { id: cuid(), ...args.data, createdAt: now, updatedAt: now };
      payslips.push(slip);
      return slip;
    },
    async update(args: { where: Where; data: Partial<MockPayslip> }): Promise<MockPayslip> {
      const idx = (payslips as Record<string, unknown>[]).findIndex((r) => matchesWhere(r, args.where));
      if (idx === -1) throw new Error("Payslip not found");
      Object.assign(payslips[idx], args.data, { updatedAt: new Date() });
      return payslips[idx];
    },
    async count(args?: { where?: Where }): Promise<number> {
      return applyWhere(payslips as Record<string, unknown>[], args?.where).length;
    },
  },

  // ── taxDeclaration ────────────────────────────────────────────────────────
  taxDeclaration: {
    async findFirst(args: {
      where: Where;
      include?: { investmentProofs?: boolean };
    }): Promise<MockTaxDeclaration | null> {
      const found = applyWhere(taxDeclarations as Record<string, unknown>[], args.where)[0] as MockTaxDeclaration ?? null;
      if (!found) return null;
      if (args.include?.investmentProofs) {
        found.investmentProofs = investmentProofs.filter((p) => p.taxDeclarationId === found.id);
      }
      return found;
    },
    async update(args: { where: Where; data: Partial<MockTaxDeclaration> }): Promise<MockTaxDeclaration> {
      const idx = (taxDeclarations as Record<string, unknown>[]).findIndex((r) => matchesWhere(r, args.where));
      if (idx === -1) throw new Error("TaxDeclaration not found");
      Object.assign(taxDeclarations[idx], args.data, { updatedAt: new Date() });
      return taxDeclarations[idx];
    },
    async upsert(args: {
      where: Where;
      create: Partial<MockTaxDeclaration>;
      update: Partial<MockTaxDeclaration>;
    }): Promise<MockTaxDeclaration> {
      const existing = applyWhere(taxDeclarations as Record<string, unknown>[], args.where)[0] as MockTaxDeclaration | undefined;
      if (existing) {
        Object.assign(existing, args.update, { updatedAt: new Date() });
        return existing;
      }
      const now = new Date();
      const decl: MockTaxDeclaration = {
        id: cuid(),
        employeeId: "",
        userId: "",
        financialYear: "",
        taxRegime: "NEW",
        ppfAmount: 0, elssAmount: 0, lifeInsurance: 0, homeLoanPrincipal: 0,
        nscAmount: 0, tuitionFees: 0, other80C: 0, total80C: 0,
        selfHealthInsurance: 0, parentHealthInsurance: 0,
        hraReceived: 0, hraExempt: 0, npsContribution: 0,
        homeLoanInterest: 0, educationLoanInterest: 0,
        grossIncome: 0, standardDeduction: 0, totalDeductions: 0,
        taxableIncome: 0, estimatedTaxLiability: 0, totalTdsPaid: 0, taxPayable: 0,
        isSubmitted: false, submittedAt: null,
        createdAt: now, updatedAt: now,
        ...args.create,
      };
      taxDeclarations.push(decl);
      return decl;
    },
  },

  // ── chatSession ───────────────────────────────────────────────────────────
  chatSession: {
    async create(args: { data: Partial<MockChatSession> & { userId: string } }): Promise<MockChatSession> {
      const now = new Date();
      const session: MockChatSession = {
        id: cuid(),
        userId: args.data.userId,
        title: args.data.title ?? null,
        isActive: true,
        contextPayload: (args.data.contextPayload as Record<string, unknown>) ?? null,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      };
      chatSessions.push(session);
      return session;
    },
    async findFirst(args: { where: Where }): Promise<MockChatSession | null> {
      return applyWhere(chatSessions as Record<string, unknown>[], args.where)[0] as MockChatSession ?? null;
    },
    async count(args?: { where?: Where }): Promise<number> {
      return applyWhere(chatSessions as Record<string, unknown>[], args?.where).length;
    },
  },

  // ── chatMessage ───────────────────────────────────────────────────────────
  chatMessage: {
    async createMany(args: { data: Partial<MockChatMessage>[] }): Promise<{ count: number }> {
      const now = new Date();
      for (const d of args.data) {
        chatMessages.push({
          id: cuid(),
          sessionId: d.sessionId ?? "",
          userId: d.userId ?? "",
          role: d.role ?? "USER",
          content: d.content ?? "",
          citations: (d.citations as unknown[] | undefined) ?? null,
          toolCalls: null,
          toolResults: null,
          isGrounded: d.isGrounded ?? false,
          confidenceScore: d.confidenceScore ?? null,
          inputTokens: d.inputTokens ?? null,
          outputTokens: d.outputTokens ?? null,
          createdAt: now,
        });
      }
      return { count: args.data.length };
    },
    async create(args: { data: Partial<MockChatMessage> }): Promise<MockChatMessage> {
      const msg: MockChatMessage = {
        id: cuid(),
        sessionId: args.data.sessionId ?? "",
        userId: args.data.userId ?? "",
        role: args.data.role ?? "USER",
        content: args.data.content ?? "",
        citations: (args.data.citations as unknown[] | undefined) ?? null,
        toolCalls: null,
        toolResults: null,
        isGrounded: args.data.isGrounded ?? false,
        confidenceScore: args.data.confidenceScore ?? null,
        inputTokens: args.data.inputTokens ?? null,
        outputTokens: args.data.outputTokens ?? null,
        createdAt: new Date(),
      };
      chatMessages.push(msg);
      return msg;
    },
  },

  // ── auditLog ──────────────────────────────────────────────────────────────
  auditLog: {
    async create(args: { data: Partial<MockAuditLog> }): Promise<MockAuditLog> {
      const log: MockAuditLog = {
        id: cuid(),
        userId: args.data.userId ?? null,
        actorId: args.data.actorId ?? null,
        action: args.data.action ?? "RECORD_VIEWED",
        resourceType: args.data.resourceType ?? "Unknown",
        resourceId: args.data.resourceId ?? null,
        metadata: (args.data.metadata as Record<string, unknown>) ?? null,
        ipAddress: args.data.ipAddress ?? null,
        userAgent: args.data.userAgent ?? null,
        requestId: args.data.requestId ?? null,
        success: args.data.success ?? true,
        errorCode: args.data.errorCode ?? null,
        createdAt: new Date(),
      };
      auditLogs.push(log);
      return log;
    },

    async findMany(args?: {
      where?: Where;
      orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>;
      take?: number;
      skip?: number;
    }): Promise<MockAuditLog[]> {
      let result = applyWhere(auditLogs as Record<string, unknown>[], args?.where) as MockAuditLog[];
      result = applyOrderBy(result as Record<string, unknown>[], args?.orderBy) as MockAuditLog[];
      if (args?.skip) result = result.slice(args.skip);
      if (args?.take) result = result.slice(0, args.take);
      return result;
    },

    async count(args?: { where?: Where }): Promise<number> {
      return applyWhere(auditLogs as Record<string, unknown>[], args?.where).length;
    },
  },

  // ── $disconnect ───────────────────────────────────────────────────────────
  $disconnect(): Promise<void> {
    return Promise.resolve();
  },
};

// ─── Auth Helper ──────────────────────────────────────────────────────────────

/** Verify credentials against mock users. Returns the user or null. */
export function verifyMockCredentials(
  email: string,
  password: string,
): MockUser | null {
  const user = users.find((u) => u.email === email && u.deletedAt === null);
  if (!user) return null;
  if (user.passwordPlain !== password) return null;
  return user;
}
