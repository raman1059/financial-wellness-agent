/**
 * OCR JSON Processor
 *
 * Accepts pre-computed OCR output from external providers and maps it to
 * our internal ExtractedFields schema.  Supports three provider schemas
 * plus a generic key-value fallback.
 *
 * Pseudocode
 * ----------
 * process(json):
 *   provider ← detectProvider(json)
 *     TEXTRACT   if json.Blocks exists
 *     GOOGLE_AI  if json.pages[].paragraphs exists
 *     TESSERACT  if json.data.words exists (tesseract.js output)
 *     GENERIC    if json is flat key-value { fieldName: amount }
 *
 *   extract(json, provider):
 *     TEXTRACT:
 *       flatten Blocks of type=LINE into text lines
 *       pass to extractFields(rawText)     [reuse existing extractor]
 *
 *     GOOGLE_AI:
 *       flatten pages[].paragraphs[].words[].symbols[].text → rawText
 *       pass to extractFields(rawText)
 *
 *     TESSERACT:
 *       join data.words[].text → rawText
 *       pass to extractFields(rawText)
 *
 *     GENERIC:
 *       map well-known key aliases directly to ExtractedFields
 *       { "basic_salary": 85000 } → { basicSalary: 85000 }
 *       unmapped keys → attempt fuzzy match against field synonyms
 *
 *   return { fields, confidence, rawText, providerUsed }
 */

import { extractFields, type ExtractedFields } from "../field-extractor";
import { normalizeAmount, normalizeText, normalizePeriod } from "../normalizer";

// ─── Provider schemas ─────────────────────────────────────────────────────────

type OcrProvider = "textract" | "google-doc-ai" | "tesseract" | "generic";

export interface OcrJsonInput {
  /** Raw JSON from any supported OCR provider, or a flat key→amount map. */
  payload:    Record<string, unknown>;
  fileName?:  string;
  provider?:  OcrProvider;   // override auto-detection
}

export interface OcrJsonResult {
  fields:      ExtractedFields;
  rawText:     string;
  confidence:  number;
  provider:    OcrProvider;
}

// ─── Provider detection ───────────────────────────────────────────────────────

function detectProvider(json: Record<string, unknown>): OcrProvider {
  if (Array.isArray(json.Blocks))                       return "textract";
  if (Array.isArray(json.pages))                        return "google-doc-ai";
  if (json.data && typeof json.data === "object")       return "tesseract";
  return "generic";
}

// ─── Textract extractor ───────────────────────────────────────────────────────

interface TextractBlock {
  BlockType: string;
  Text?:     string;
  Confidence?: number;
}

function extractFromTextract(json: Record<string, unknown>): { rawText: string; confidence: number } {
  const blocks = (json.Blocks as TextractBlock[]) ?? [];
  const lines  = blocks
    .filter((b) => b.BlockType === "LINE" && b.Text)
    .map((b) => b.Text!);

  const confidences = blocks
    .filter((b) => b.Confidence !== undefined)
    .map((b) => (b.Confidence ?? 100) / 100);

  const avgConf = confidences.length
    ? confidences.reduce((s, c) => s + c, 0) / confidences.length
    : 0.88;

  return { rawText: lines.join("\n"), confidence: avgConf };
}

// ─── Google Document AI extractor ────────────────────────────────────────────

function extractFromGoogleDocAI(json: Record<string, unknown>): { rawText: string; confidence: number } {
  // Minimal mapping — production would also handle form fields / key-value pairs
  const pages = (json.pages as Array<{ paragraphs?: Array<{ layout?: { text?: string } }> }>) ?? [];
  const lines: string[] = [];
  for (const page of pages) {
    for (const para of page.paragraphs ?? []) {
      const t = para.layout?.text?.trim();
      if (t) lines.push(t);
    }
  }
  const confidence = typeof json.confidence === "number" ? json.confidence : 0.90;
  return { rawText: lines.join("\n"), confidence };
}

// ─── Tesseract.js extractor ───────────────────────────────────────────────────

function extractFromTesseract(json: Record<string, unknown>): { rawText: string; confidence: number } {
  const data = json.data as { text?: string; confidence?: number } | undefined;
  return {
    rawText:    data?.text ?? "",
    confidence: ((data?.confidence ?? 88) / 100),
  };
}

// ─── Generic key-value extractor ─────────────────────────────────────────────

// Alias map: any key (lowercase, no separators) → ExtractedFields key
const FIELD_ALIASES: Record<string, keyof ExtractedFields> = {
  basic: "basicSalary", basicsalary: "basicSalary", basepay: "basicSalary",
  hra: "hra", houserental: "hra", houserent: "hra",
  lta: "lta", leavetravelallowance: "lta", leavetravel: "lta",
  specialallowance: "specialAllowance", specialpay: "specialAllowance",
  otherearnings: "otherEarnings", otherallowances: "otherEarnings",
  gross: "grossSalary", grosssalary: "grossSalary", grosspay: "grossSalary",
  pf: "providentFund", epf: "providentFund", providentfund: "providentFund",
  pt: "professionalTax", professionaltax: "professionalTax",
  tds: "tdsDeducted", incometax: "tdsDeducted", taxdeducted: "tdsDeducted",
  esic: "esic", esi: "esic",
  otherdeductions: "otherDeductions",
  totaldeductions: "totalDeductions", deductions: "totalDeductions",
  net: "netSalary", netsalary: "netSalary", netpay: "netSalary", takehome: "netSalary",
  payperiodmonth: "payPeriodMonth", month: "payPeriodMonth",
  payperiodyear:  "payPeriodYear",  year:  "payPeriodYear",
  employername: "employerName", company: "employerName", employer: "employerName",
  employeeid: "employeeId", empid: "employeeId", employeecode: "employeeId",
};

function canonicalKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-\.]/g, "");
}

function extractFromGeneric(json: Record<string, unknown>): {
  fields: Partial<ExtractedFields>;
  confidence: number;
} {
  const fields: Partial<ExtractedFields> = {};
  let mappedCount = 0;

  for (const [rawKey, rawValue] of Object.entries(json)) {
    const alias = FIELD_ALIASES[canonicalKey(rawKey)];
    if (!alias) continue;
    mappedCount++;

    if (alias === "employerName" || alias === "employeeId") {
      (fields[alias] as string | null) = normalizeText(String(rawValue));
    } else if (alias === "payPeriodMonth" || alias === "payPeriodYear") {
      (fields[alias] as number | null) = Number(rawValue) || null;
    } else {
      (fields[alias] as number) = normalizeAmount(rawValue as string | number);
    }
  }

  // Also try to parse a period field if present
  const periodRaw = (json.period ?? json.pay_period ?? json.payPeriod) as string | undefined;
  if (periodRaw && typeof periodRaw === "string" && !fields.payPeriodMonth) {
    const { month, year } = normalizePeriod(periodRaw);
    if (month) fields.payPeriodMonth = month;
    if (year)  fields.payPeriodYear  = year;
  }

  // Confidence proportional to how many fields we successfully mapped
  const totalKeys  = Object.keys(json).length;
  const confidence = totalKeys > 0 ? Math.min(0.95, 0.5 + (mappedCount / totalKeys) * 0.5) : 0.5;

  return { fields, confidence };
}

// ─── Default ExtractedFields ──────────────────────────────────────────────────

function defaultFields(): ExtractedFields {
  return {
    employerName: null, employeeId: null,
    payPeriodMonth: null, payPeriodYear: null,
    basicSalary: 0, hra: 0, lta: 0, specialAllowance: 0, otherEarnings: 0,
    grossSalary: 0, providentFund: 0, professionalTax: 0, tdsDeducted: 0,
    esic: 0, otherDeductions: 0, totalDeductions: 0, netSalary: 0,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function processOcrJson(input: OcrJsonInput): OcrJsonResult {
  const { payload, fileName } = input;
  const provider = input.provider ?? detectProvider(payload);

  if (provider === "textract") {
    const { rawText, confidence } = extractFromTextract(payload);
    const { fields }              = extractFields(rawText);
    return { fields, rawText, confidence, provider };
  }

  if (provider === "google-doc-ai") {
    const { rawText, confidence } = extractFromGoogleDocAI(payload);
    const { fields }              = extractFields(rawText);
    return { fields, rawText, confidence, provider };
  }

  if (provider === "tesseract") {
    const { rawText, confidence } = extractFromTesseract(payload);
    const { fields }              = extractFields(rawText);
    return { fields, rawText, confidence, provider };
  }

  // Generic: direct key-value map
  const { fields: partialFields, confidence } = extractFromGeneric(payload);
  const fields: ExtractedFields = { ...defaultFields(), ...partialFields };
  return {
    fields,
    rawText: JSON.stringify(payload, null, 2),
    confidence,
    provider: "generic",
  };
}
