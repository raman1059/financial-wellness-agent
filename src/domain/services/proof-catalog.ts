/**
 * Proof Catalog
 *
 * Master registry of every investment-proof type the system recognises.
 * One entry per proof type: what documents are accepted, which tax section
 * it belongs to, statutory caps, and plain-language action text for employees.
 *
 * This is a pure data file — no I/O, no external dependencies.
 * The checklist use-case drives logic; this file drives content.
 */

// ─── Proof type identifiers ───────────────────────────────────────────────────

export type ProofType =
  | "PPF_STATEMENT"
  | "ELSS_STATEMENT"
  | "LIFE_INSURANCE_PREMIUM"
  | "HOME_LOAN_PRINCIPAL_CERT"
  | "NSC_CERTIFICATE"
  | "TUITION_FEE_RECEIPT"
  | "OTHER_80C"
  | "HEALTH_INS_SELF"
  | "HEALTH_INS_PARENT"
  | "RENT_RECEIPT"
  | "NPS_CONTRIBUTION_RECEIPT"
  | "HOME_LOAN_INTEREST_CERT"
  | "EDUCATION_LOAN_CERT";

// Maps a declaration field name → the proof type that covers it
export const DECLARATION_FIELD_TO_PROOF: Record<string, ProofType> = {
  ppfAmount:             "PPF_STATEMENT",
  elssAmount:            "ELSS_STATEMENT",
  lifeInsurance:         "LIFE_INSURANCE_PREMIUM",
  homeLoanPrincipal:     "HOME_LOAN_PRINCIPAL_CERT",
  nscAmount:             "NSC_CERTIFICATE",
  tuitionFees:           "TUITION_FEE_RECEIPT",
  other80C:              "OTHER_80C",
  selfHealthInsurance:   "HEALTH_INS_SELF",
  parentHealthInsurance: "HEALTH_INS_PARENT",
  hraReceived:           "RENT_RECEIPT",
  npsContribution:       "NPS_CONTRIBUTION_RECEIPT",
  homeLoanInterest:      "HOME_LOAN_INTEREST_CERT",
  educationLoanInterest: "EDUCATION_LOAN_CERT",
};

// ─── Section caps (used for headroom display) ─────────────────────────────────

export const SECTION_CAPS: Record<string, number> = {
  "80C":       1_50_000,
  "80CCD(1B)":   50_000,
  "80D_SELF":    25_000,  // 50K if senior
  "80D_PARENT":  50_000,  // always show senior limit as max
  "HRA":         Infinity, // computed dynamically
  "24(b)":     2_00_000,
  "80E":         Infinity,
};

// ─── Proof catalog entry ──────────────────────────────────────────────────────

export interface ProofCatalogEntry {
  proofType:      ProofType;
  /** Short label shown in the checklist UI */
  label:          string;
  /** Tax section this deduction falls under */
  section:        string;
  /** Human-readable section description */
  sectionLabel:   string;
  /** Statutory deduction cap in rupees (Infinity = no cap) */
  sectionCap:     number;
  /** Employee-friendly description of what this covers */
  description:    string;
  /** Specific documents the employer accepts */
  acceptedDocuments: string[];
  /** Where to obtain the document */
  howToObtain:    string;
  /** Key things to verify before uploading */
  checkBefore:    string[];
  /** Typical employer submission deadline (month name) */
  employerDeadlineMonth: string;
  /** Supported file types */
  acceptedMimeTypes: string[];
}

// ─── The catalog ──────────────────────────────────────────────────────────────

export const PROOF_CATALOG: Record<ProofType, ProofCatalogEntry> = {
  PPF_STATEMENT: {
    proofType:    "PPF_STATEMENT",
    label:        "PPF Account Statement",
    section:      "80C",
    sectionLabel: "Section 80C — Provident Fund & Long-Term Savings",
    sectionCap:   1_50_000,
    description:  "Public Provident Fund annual account statement showing contributions made in the financial year.",
    acceptedDocuments: [
      "Passbook showing FY transactions",
      "Annual account statement downloaded from Post Office / SBI / authorised bank app",
    ],
    howToObtain:  "Log in to your Post Office / bank app → PPF account → Download statement for the FY.",
    checkBefore:  [
      "Statement period covers the full financial year (Apr–Mar)",
      "Your name and account number are visible",
      "Total contribution for the year matches your declaration",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  ELSS_STATEMENT: {
    proofType:    "ELSS_STATEMENT",
    label:        "ELSS Investment Statement",
    section:      "80C",
    sectionLabel: "Section 80C — Provident Fund & Long-Term Savings",
    sectionCap:   1_50_000,
    description:  "Equity Linked Savings Scheme transaction statement confirming investment during the FY.",
    acceptedDocuments: [
      "ELSS transaction statement from your mutual fund (Zerodha / Groww / AMC app)",
      "Folio statement showing investment date and amount",
    ],
    howToObtain:  "Download from your mutual fund platform → Statement → Filter by FY dates.",
    checkBefore:  [
      "Fund name and folio number are clearly visible",
      "Investment dates fall within the financial year (1 Apr – 31 Mar)",
      "Total investment amount matches your declaration",
      "3-year lock-in from each SIP date — no early redemption",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  LIFE_INSURANCE_PREMIUM: {
    proofType:    "LIFE_INSURANCE_PREMIUM",
    label:        "Life Insurance Premium Receipt",
    section:      "80C",
    sectionLabel: "Section 80C — Provident Fund & Long-Term Savings",
    sectionCap:   1_50_000,
    description:  "Premium payment receipt for life insurance policy for self, spouse, or dependent children.",
    acceptedDocuments: [
      "Premium payment receipt from insurer (LIC / private insurer)",
      "Policy schedule showing annual premium",
      "Bank statement with premium debit (if online payment)",
    ],
    howToObtain:  "Log in to insurer's portal (licindia.in / policybazaar etc.) → Payment history → Download receipt.",
    checkBefore:  [
      "Policy is in your name or your spouse's / children's name",
      "Annual premium ≤ 10% of sum assured (for full 80C eligibility)",
      "Policy is not surrendered during the FY",
      "Receipt shows financial year and amount clearly",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  HOME_LOAN_PRINCIPAL_CERT: {
    proofType:    "HOME_LOAN_PRINCIPAL_CERT",
    label:        "Home Loan Principal Certificate",
    section:      "80C",
    sectionLabel: "Section 80C — Provident Fund & Long-Term Savings",
    sectionCap:   1_50_000,
    description:  "Home loan repayment statement showing principal component paid during the FY.",
    acceptedDocuments: [
      "Annual home loan statement from bank / NBFC",
      "Provisional certificate for the FY",
    ],
    howToObtain:  "Request from your bank's home loan department or download from net banking.",
    checkBefore:  [
      "Statement clearly separates principal and interest components",
      "Property construction was completed before claiming deduction",
      "Property is not sold within 5 years of purchase",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  NSC_CERTIFICATE: {
    proofType:    "NSC_CERTIFICATE",
    label:        "NSC Purchase Certificate",
    section:      "80C",
    sectionLabel: "Section 80C — Provident Fund & Long-Term Savings",
    sectionCap:   1_50_000,
    description:  "National Savings Certificate purchase receipt or passbook showing investment during the FY.",
    acceptedDocuments: [
      "NSC certificate from Post Office",
      "Passbook with NSC purchase entry",
    ],
    howToObtain:  "Obtain physical certificate from Post Office or download digital certificate from India Post app.",
    checkBefore:  [
      "Purchase date falls within the financial year",
      "Certificate is in your name",
      "Face value matches the declared amount",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  TUITION_FEE_RECEIPT: {
    proofType:    "TUITION_FEE_RECEIPT",
    label:        "Tuition Fee Receipt",
    section:      "80C",
    sectionLabel: "Section 80C — Provident Fund & Long-Term Savings",
    sectionCap:   1_50_000,
    description:  "Fee receipt for full-time education of up to 2 children at a school / college in India.",
    acceptedDocuments: [
      "Fee receipt issued by school / college / university",
      "Fee payment confirmation from institution portal",
    ],
    howToObtain:  "Collect from school / college accounts office or download from student portal.",
    checkBefore:  [
      "Institution is located in India",
      "Child is enrolled full-time (not correspondence / part-time)",
      "Only tuition fees qualify — hostel, transport, activity fees do NOT",
      "Maximum 2 children's fees combined",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  OTHER_80C: {
    proofType:    "OTHER_80C",
    label:        "Other 80C Investment Proof",
    section:      "80C",
    sectionLabel: "Section 80C — Provident Fund & Long-Term Savings",
    sectionCap:   1_50_000,
    description:  "Proof for other qualifying 80C investments (Sukanya Samriddhi Yojana, 5-year bank FD, etc.).",
    acceptedDocuments: [
      "SSY passbook or bank statement",
      "5-year tax-saver FD receipt",
      "Any government-notified savings instrument receipt",
    ],
    howToObtain:  "Obtain from respective bank, post office, or financial institution.",
    checkBefore:  [
      "Investment qualifies under Section 80C (verify with CA if unsure)",
      "Amount and date are clearly visible",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  HEALTH_INS_SELF: {
    proofType:    "HEALTH_INS_SELF",
    label:        "Health Insurance Premium — Self & Family",
    section:      "80D",
    sectionLabel: "Section 80D — Health Insurance",
    sectionCap:   25_000,
    description:  "Health insurance premium receipt for self, spouse, and dependent children (under 60 years).",
    acceptedDocuments: [
      "Premium receipt / policy schedule from insurer",
      "Bank statement showing premium debit",
      "Policy renewal notice with amount",
    ],
    howToObtain:  "Download from insurer's app or email confirmation of premium payment.",
    checkBefore:  [
      "Policy covers self, spouse, or dependent children",
      "Premium paid by any mode OTHER than cash (cheque, UPI, card)",
      "Policy is a genuine health insurance policy — not term/life",
      "If self/spouse is a senior citizen (≥60), limit increases to ₹50,000",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  HEALTH_INS_PARENT: {
    proofType:    "HEALTH_INS_PARENT",
    label:        "Health Insurance Premium — Parents",
    section:      "80D",
    sectionLabel: "Section 80D — Health Insurance",
    sectionCap:   50_000,
    description:  "Health insurance premium paid for parents (limit: ₹25,000; ₹50,000 if parents are senior citizens).",
    acceptedDocuments: [
      "Premium receipt from insurer showing insured names",
      "Policy schedule clearly naming parent(s)",
    ],
    howToObtain:  "Download from your insurer's portal or collect premium receipt.",
    checkBefore:  [
      "Parents are named as insured on the policy",
      "You (not parent) are the premium payer",
      "Premium not paid in cash",
      "If either parent is ≥60 years, you qualify for ₹50,000 limit",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  RENT_RECEIPT: {
    proofType:    "RENT_RECEIPT",
    label:        "Rent Receipt / Rent Agreement",
    section:      "HRA",
    sectionLabel: "HRA — House Rent Allowance Exemption",
    sectionCap:   Infinity,
    description:  "Proof of rent payment for House Rent Allowance (HRA) exemption claim.",
    acceptedDocuments: [
      "Monthly rent receipts signed by landlord (required if annual rent > ₹1 lakh)",
      "Rent agreement / lease agreement",
      "Bank statement showing rent transfers",
      "Landlord's PAN (mandatory if annual rent exceeds ₹1,00,000)",
    ],
    howToObtain:  "Obtain signed receipts from your landlord each month. PAN of landlord required if annual rent > ₹1L.",
    checkBefore:  [
      "Receipts are signed by landlord with date",
      "Receipt shows your name, landlord name, property address, and amount",
      "You actually live in the rented property (no HRA on owned home)",
      "Annual rent > ₹1L → landlord PAN mandatory",
      "HRA cannot be claimed by employees in their own city if they own a house there",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  NPS_CONTRIBUTION_RECEIPT: {
    proofType:    "NPS_CONTRIBUTION_RECEIPT",
    label:        "NPS Contribution Statement",
    section:      "80CCD(1B)",
    sectionLabel: "Section 80CCD(1B) — National Pension System",
    sectionCap:   50_000,
    description:  "NPS Tier-1 contribution statement for additional deduction of up to ₹50,000 over 80C limit.",
    acceptedDocuments: [
      "NPS contribution statement from NSDL / KFintech",
      "Annual transaction statement from PRAN portal (enps.nsdl.com)",
    ],
    howToObtain:  "Log in to enps.nsdl.com → Transaction Statement → Download for FY.",
    checkBefore:  [
      "Only Tier-1 contributions qualify (not Tier-2)",
      "Your PRAN number is visible on the statement",
      "Contributions are within the financial year dates",
      "Available under Old Regime only",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  HOME_LOAN_INTEREST_CERT: {
    proofType:    "HOME_LOAN_INTEREST_CERT",
    label:        "Home Loan Interest Certificate",
    section:      "24(b)",
    sectionLabel: "Section 24(b) — Home Loan Interest",
    sectionCap:   2_00_000,
    description:  "Annual home loan statement showing interest paid during the FY. Deduction capped at ₹2,00,000 for self-occupied property.",
    acceptedDocuments: [
      "Provisional interest certificate from bank / NBFC",
      "Annual home loan account statement",
    ],
    howToObtain:  "Request from your bank's home loan department or download from net banking → Home Loan → Statements.",
    checkBefore:  [
      "Statement clearly shows interest and principal split",
      "Property construction was completed before the FY",
      "If let-out property: actual interest (no cap, but set-off limited to ₹2L against salary)",
      "Not available under New Regime",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },

  EDUCATION_LOAN_CERT: {
    proofType:    "EDUCATION_LOAN_CERT",
    label:        "Education Loan Interest Certificate",
    section:      "80E",
    sectionLabel: "Section 80E — Education Loan Interest",
    sectionCap:   Infinity,
    description:  "Certificate showing interest paid on education loan for higher studies. No upper cap on deduction amount.",
    acceptedDocuments: [
      "Annual interest certificate from bank",
      "Loan repayment statement clearly showing interest component",
    ],
    howToObtain:  "Request from your bank's education loan department.",
    checkBefore:  [
      "Loan is for higher education (not school fees)",
      "Loan taken for self, spouse, children, or a student for whom you are legal guardian",
      "Deduction available for 8 consecutive years from start of repayment",
      "Interest component only — principal repayment does NOT qualify under 80E",
    ],
    employerDeadlineMonth: "January",
    acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg"],
  },
};
