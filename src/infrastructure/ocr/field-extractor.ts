/**
 * Field Extractor
 *
 * Parses structured payroll fields from raw OCR text using regex patterns.
 * Designed to be resilient: unknown fields default to 0 rather than failing.
 *
 * In production, this module would handle real OCR output from Textract/Tesseract
 * with the same pattern-matching approach.
 */

export interface ExtractedFields {
  employerName:     string | null;
  employeeId:       string | null;
  payPeriodMonth:   number | null;
  payPeriodYear:    number | null;
  basicSalary:      number;
  hra:              number;   // House Rent Allowance
  lta:              number;   // Leave Travel Allowance
  specialAllowance: number;
  otherEarnings:    number;
  grossSalary:      number;
  providentFund:    number;
  professionalTax:  number;
  tdsDeducted:      number;
  esic:             number;
  otherDeductions:  number;
  totalDeductions:  number;
  netSalary:        number;
}

export interface ExtractionResult {
  fields:     ExtractedFields;
  parseErrors: string[];
  fieldScores: Record<keyof ExtractedFields, number>; // 0-1 per-field confidence
}

// ─── Helper: extract INR amount from a text line ──────────────────────────────

function parseAmount(text: string): number | null {
  // Handles: "INR 1,40,000", "Rs. 140000", "₹1,40,000", "1,40,000", "140000"
  const match = text.match(/(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ─── Helper: find first line matching a label pattern and extract amount ──────

function extractField(text: string, patterns: RegExp[]): number {
  const lines = text.split("\n");
  for (const line of lines) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        const amount = parseAmount(line);
        if (amount !== null) return amount;
      }
    }
  }
  return 0;
}

function extractString(text: string, patterns: RegExp[]): string | null {
  const lines = text.split("\n");
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        // Return everything after the first colon/separator on the line
        const afterColon = line.split(/:\s*/)[1]?.trim();
        return afterColon ?? null;
      }
    }
  }
  return null;
}

function extractPayPeriod(text: string): { month: number | null; year: number | null } {
  // "Pay Period : 06/2025" or "06-2025" or "June 2025"
  const slashMatch  = text.match(/pay\s*period\s*[:\-]\s*(\d{1,2})[\/\-](\d{4})/i);
  const monthNames  = ["january","february","march","april","may","june","july","august","september","october","november","december"];

  if (slashMatch) {
    return { month: Number(slashMatch[1]), year: Number(slashMatch[2]) };
  }

  for (let i = 0; i < monthNames.length; i++) {
    const re = new RegExp(`${monthNames[i]}\\s+(20\\d{2})`, "i");
    const m  = text.match(re);
    if (m) return { month: i + 1, year: Number(m[1]) };
  }

  const yearOnly = text.match(/20\d{2}/);
  return { month: null, year: yearOnly ? Number(yearOnly[0]) : null };
}

// ─── Field confidence: 1.0 if clearly non-zero, 0.6 if zero (may be absent) ──

function score(value: number, required = false): number {
  if (value > 0) return 1.0;
  return required ? 0.4 : 0.7;
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export function extractFields(rawText: string): ExtractionResult {
  const parseErrors: string[] = [];

  const employerName = extractString(rawText, [/employer/i, /company\s*name/i, /organization/i]);
  const employeeId   = extractString(rawText, [/employee\s*(id|code|no)/i]);
  const period       = extractPayPeriod(rawText);

  const basicSalary      = extractField(rawText, [/basic\s*(salary|pay)/i]);
  const hra              = extractField(rawText, [/house\s*rent/i, /\bhra\b/i]);
  const lta              = extractField(rawText, [/leave\s*travel/i, /\blta\b/i]);
  const specialAllowance = extractField(rawText, [/special\s*allow/i]);
  const otherEarnings    = extractField(rawText, [/other\s*(earn|allow|income)/i]);

  const grossSalary      = extractField(rawText, [/gross\s*(salary|pay|earning)/i]);

  const providentFund    = extractField(rawText, [/provident\s*fund/i, /\bepf\b/i, /\bpf\b/i]);
  const professionalTax  = extractField(rawText, [/professional\s*tax/i, /\bpt\b/i]);
  const tdsDeducted      = extractField(rawText, [/tds\b/i, /income\s*tax/i, /tax\s*deducted/i]);
  const esic             = extractField(rawText, [/\besic\b/i, /employee\s*state\s*insurance/i]);
  const otherDeductions  = extractField(rawText, [/other\s*deduct/i]);
  const totalDeductions  = extractField(rawText, [/total\s*deduct/i]);

  const netSalary        = extractField(rawText, [/net\s*(salary|pay|take.?home)/i]);

  // Validation warnings (not hard errors — data is still returned)
  if (basicSalary === 0) parseErrors.push("Basic salary could not be extracted");
  if (grossSalary === 0) parseErrors.push("Gross salary could not be extracted");
  if (netSalary   === 0) parseErrors.push("Net salary could not be extracted");
  if (!period.month)    parseErrors.push("Pay period month could not be determined");

  const fields: ExtractedFields = {
    employerName,
    employeeId,
    payPeriodMonth:  period.month,
    payPeriodYear:   period.year,
    basicSalary,
    hra,
    lta,
    specialAllowance,
    otherEarnings,
    grossSalary,
    providentFund,
    professionalTax,
    tdsDeducted,
    esic,
    otherDeductions,
    totalDeductions,
    netSalary,
  };

  const fieldScores: Record<keyof ExtractedFields, number> = {
    employerName:    employerName ? 1.0 : 0.5,
    employeeId:      employeeId   ? 1.0 : 0.5,
    payPeriodMonth:  period.month ? 1.0 : 0.3,
    payPeriodYear:   period.year  ? 1.0 : 0.3,
    basicSalary:     score(basicSalary, true),
    hra:             score(hra),
    lta:             score(lta),
    specialAllowance: score(specialAllowance),
    otherEarnings:   score(otherEarnings),
    grossSalary:     score(grossSalary, true),
    providentFund:   score(providentFund),
    professionalTax: score(professionalTax),
    tdsDeducted:     score(tdsDeducted),
    esic:            score(esic),
    otherDeductions: score(otherDeductions),
    totalDeductions: score(totalDeductions),
    netSalary:       score(netSalary, true),
  };

  return { fields, parseErrors, fieldScores };
}
