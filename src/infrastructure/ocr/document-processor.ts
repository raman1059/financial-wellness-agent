/**
 * Document Processor — Main Orchestrator
 *
 * Single entry point for all document processing.  Input can be:
 *   A) A File object (PDF, PNG, JPEG, WebP)
 *   B) An OcrJsonInput (pre-computed OCR from any supported provider)
 *
 * Full pipeline pseudocode
 * ─────────────────────────
 * process(input):
 *
 *   ┌─ STEP 1: CLASSIFY ─────────────────────────────────────────────┐
 *   │  if input is OcrJsonInput  → processor = OcrJsonProcessor      │
 *   │  if MIME = application/pdf → processor = PdfProcessor          │
 *   │  if MIME = image/*         → processor = ImageProcessor        │
 *   │  else                      → throw UnsupportedInputError       │
 *   └────────────────────────────────────────────────────────────────┘
 *           │
 *           ▼
 *   ┌─ STEP 2: EXTRACT ──────────────────────────────────────────────┐
 *   │  PDF:      extractTextLayer → if empty → image OCR fallback    │
 *   │  Image:    preprocess (greyscale, threshold) → runMockOcr()    │
 *   │  OcrJson:  detectProvider → map provider schema → fields       │
 *   │  Output:   { rawText, fields?, confidence, provider }          │
 *   └────────────────────────────────────────────────────────────────┘
 *           │
 *           ▼
 *   ┌─ STEP 3: NORMALIZE ────────────────────────────────────────────┐
 *   │  fixOcrErrors(rawText)                                         │
 *   │  normalizeAmount() on every numeric field                      │
 *   │    "₹1.4L" → 140000  |  "14,500" → 14500  |  "(500)" → 0     │
 *   │  normalizePeriod() on date strings                             │
 *   │    "Q1 FY25" → {month:4, year:2025}                           │
 *   └────────────────────────────────────────────────────────────────┘
 *           │
 *           ▼
 *   ┌─ STEP 4: EXTRACT FIELDS (if rawText path) ─────────────────────┐
 *   │  extractFields(normalizedText)                                  │
 *   │  → regex matching for each field with fallback to 0            │
 *   │  → per-field confidence scores                                  │
 *   └─────────────────────────────────────────────────────────────────┘
 *           │
 *           ▼
 *   ┌─ STEP 5: IMPUTE MISSING FIELDS ────────────────────────────────┐
 *   │  Phase 1 (high conf):  gross ← sum(earnings) if gross=0       │
 *   │                        totalDed ← sum(deductions) if=0        │
 *   │                        net ← gross - totalDed if net=0        │
 *   │  Phase 2 (med conf):   pf ← basic × 0.12 if pf=0             │
 *   │                        pt ← Maharashtra slab if pt=0          │
 *   │  Phase 3 (low conf):   basic ← gross × 0.40 if all=0         │
 *   │  Phase 4 (filename):   period ← extractFromFilename()         │
 *   │  Records imputedFields[] — shown to user for transparency      │
 *   └────────────────────────────────────────────────────────────────┘
 *           │
 *           ▼
 *   ┌─ STEP 6: VALIDATE ─────────────────────────────────────────────┐
 *   │  Rule 1: gross = Σ earnings             (WARNING ±3%)          │
 *   │  Rule 2: totalDed = Σ deductions        (WARNING ±3%)          │
 *   │  Rule 3: net = gross − totalDed         (ERROR   ±3%)          │
 *   │  Rule 4: basic > 0                      (ERROR)                │
 *   │  Rule 5: HRA ≤ 60% of basic            (WARNING)              │
 *   │  Rule 6: PF ≈ 12% of basic ± 5%        (WARNING)              │
 *   │  Rule 7: ₹5K ≤ gross ≤ ₹1Cr           (WARNING)              │
 *   │  Rule 8: pay period present             (ERROR)                │
 *   └────────────────────────────────────────────────────────────────┘
 *           │
 *           ▼
 *   ┌─ STEP 7: SCORE ────────────────────────────────────────────────┐
 *   │  base    = ocrConfidence (from provider)                       │
 *   │  perField = avg(fieldScores[]) from extractor                  │
 *   │  penalty  = 1 − (errors×0.15 + warnings×0.05)                 │
 *   │  imputed  = 1 − (imputedKeys.length × 0.03)                   │
 *   │  final    = base × perField × penalty × imputed                │
 *   └────────────────────────────────────────────────────────────────┘
 *           │
 *           ▼
 *   ┌─ STEP 8: RETURN StructuredPayrollData ─────────────────────────┐
 *   │  { fields, confidence, status, imputedFields[],               │
 *   │    issues[], rawText, processorUsed, providerMeta }            │
 *   └────────────────────────────────────────────────────────────────┘
 */

import { extractFields }             from "./field-extractor";
import { validateFields }            from "./field-validator";
import { imputeFields }              from "./field-imputor";
import { fixOcrErrors, normalizeAmount, normalizeText, normalizePeriod } from "./normalizer";
import { extractFromPdf }            from "./processors/pdf.processor";
import { extractFromImage }          from "./processors/image.processor";
import { processOcrJson }            from "./processors/ocr-json.processor";
import type { ExtractedFields }      from "./field-extractor";
import type { ValidationIssue }      from "./field-validator";
import type { OcrJsonInput }         from "./processors/ocr-json.processor";

// ─── File signature (magic byte) validation ───────────────────────────────────
//
// Catches files that declare one MIME type in their Content-Type header but are
// actually a different (or corrupted) format. This matters because:
//   1. A corrupt PDF that passes the MIME check would silently produce zero-OCR output.
//   2. A crafted file could exploit a MIME-type-based code path it wasn't intended for.
//
// We check magic bytes rather than relying on the client-supplied MIME type alone.

interface SignatureCheck {
  isValid:    boolean;
  detected:   string;   // what we actually found, e.g. "image/png"
  declared:   string;   // what the caller claimed
  isTruncated: boolean; // buffer too small to read magic bytes
}

const MAGIC: Array<{ mime: string; offset: number; bytes: number[] }> = [
  // PDF: "%PDF"
  { mime: "application/pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  // PNG: "\x89PNG\r\n\x1a\n"
  { mime: "image/png",       offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // JPEG: "\xFF\xD8\xFF"
  { mime: "image/jpeg",      offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // WebP: "RIFF????WEBP"  (bytes 8-11 are "WEBP")
  { mime: "image/webp",      offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
];

function validateFileSignature(buffer: Buffer, declaredMime: string): SignatureCheck {
  const MIN_BYTES = 12;
  if (buffer.length < MIN_BYTES) {
    return { isValid: false, detected: "unknown", declared: declaredMime, isTruncated: true };
  }

  for (const sig of MAGIC) {
    const end = sig.offset + sig.bytes.length;
    if (buffer.length < end) continue;
    const slice = [...buffer.subarray(sig.offset, end)];
    if (slice.every((b, i) => b === sig.bytes[i])) {
      const mimeMatch =
        sig.mime === declaredMime ||
        // jpeg and jpg are the same format
        (sig.mime === "image/jpeg" && declaredMime === "image/jpg");
      return { isValid: mimeMatch, detected: sig.mime, declared: declaredMime, isTruncated: false };
    }
  }

  return { isValid: false, detected: "unknown/binary", declared: declaredMime, isTruncated: false };
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface FileInput {
  kind:     "file";
  buffer:   Buffer;
  fileName: string;
  mimeType: string;
}

export interface JsonInput {
  kind:    "ocr-json";
  payload: OcrJsonInput;
}

export type DocumentInput = FileInput | JsonInput;

// ─── Output ───────────────────────────────────────────────────────────────────

export type ProcessingStatus = "PARSED" | "PARSED_WITH_WARNINGS" | "FAILED";

export interface StructuredPayrollData {
  /** Final merged, normalised, imputed and validated fields. */
  fields:          ExtractedFields;

  /** 0–1 composite confidence score across all pipeline stages. */
  confidence:      number;

  /** PARSED | PARSED_WITH_WARNINGS | FAILED */
  status:          ProcessingStatus;

  /** Fields that were absent in source and derived by the imputor. */
  imputedFields:   Array<keyof ExtractedFields>;

  /** Fields imputed with low confidence (heuristics, not accounting rules). */
  lowConfFields:   Array<keyof ExtractedFields>;

  /** Typed validation issues — ERRORs cause FAILED, WARNINGs do not. */
  issues:          ValidationIssue[];

  /** Raw OCR text (or serialised JSON) — preserved for audit trail. */
  rawText:         string;

  /** Which processor handled the document. */
  processorUsed:   "pdf-native" | "pdf-scanned" | "image" | "ocr-json";

  providerMeta: {
    name:       string;
    durationMs: number;
  };
}

// ─── Normalise an ExtractedFields object's numeric values ─────────────────────

function normalizeExtractedFields(f: ExtractedFields): ExtractedFields {
  return {
    employerName:     normalizeText(f.employerName),
    employeeId:       normalizeText(f.employeeId),
    payPeriodMonth:   f.payPeriodMonth,
    payPeriodYear:    f.payPeriodYear,
    basicSalary:      normalizeAmount(f.basicSalary),
    hra:              normalizeAmount(f.hra),
    lta:              normalizeAmount(f.lta),
    specialAllowance: normalizeAmount(f.specialAllowance),
    otherEarnings:    normalizeAmount(f.otherEarnings),
    grossSalary:      normalizeAmount(f.grossSalary),
    providentFund:    normalizeAmount(f.providentFund),
    professionalTax:  normalizeAmount(f.professionalTax),
    tdsDeducted:      normalizeAmount(f.tdsDeducted),
    esic:             normalizeAmount(f.esic),
    otherDeductions:  normalizeAmount(f.otherDeductions),
    totalDeductions:  normalizeAmount(f.totalDeductions),
    netSalary:        normalizeAmount(f.netSalary),
  };
}

// ─── Confidence scorer ────────────────────────────────────────────────────────

function scoreConfidence(
  ocrBase:       number,
  fieldScores:   Record<string, number>,
  issues:        ValidationIssue[],
  imputedCount:  number,
): number {
  const values      = Object.values(fieldScores);
  const perField    = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 1;

  const errorCount   = issues.filter((i) => i.severity === "ERROR").length;
  const warningCount = issues.filter((i) => i.severity === "WARNING").length;
  const penalty      = Math.max(0, 1 - errorCount * 0.15 - warningCount * 0.05);

  const imputedPenalty = Math.max(0, 1 - imputedCount * 0.03);

  return Math.round(ocrBase * perField * penalty * imputedPenalty * 1000) / 1000;
}

// ─── Main processor ───────────────────────────────────────────────────────────

export async function processDocument(input: DocumentInput): Promise<StructuredPayrollData> {
  // ── STEP 1 & 2: CLASSIFY + EXTRACT ──────────────────────────────────────────

  let rawText       = "";
  let ocrConfidence = 0.90;
  let providerName  = "unknown";
  let durationMs    = 0;
  let processorUsed: StructuredPayrollData["processorUsed"] = "image";
  let preExtracted:  ExtractedFields | null = null;

  // ── STEP 1a: File integrity guard (file inputs only) ────────────────────────
  // Validate magic bytes BEFORE classify/extract so a corrupted or misrepresented
  // file never reaches the OCR engine and produces silently wrong output.
  if (input.kind === "file") {
    const sig = validateFileSignature(input.buffer, input.mimeType);
    if (sig.isTruncated) {
      throw new Error("File is too small to be a valid payslip (less than 12 bytes)");
    }
    if (!sig.isValid) {
      throw new Error(
        `File content does not match the declared MIME type "${input.mimeType}" ` +
        `(detected: "${sig.detected}"). Re-export the document and try again.`,
      );
    }
  }

  if (input.kind === "ocr-json") {
    const result = processOcrJson(input.payload);
    rawText       = result.rawText;
    ocrConfidence = result.confidence;
    providerName  = result.provider;
    preExtracted  = result.fields;
    processorUsed = "ocr-json";
    durationMs    = 0;

  } else if (input.mimeType === "application/pdf") {
    const start  = Date.now();
    const result = await extractFromPdf(input.buffer, input.fileName);
    rawText       = result.rawText;
    ocrConfidence = result.confidence;
    providerName  = result.provider;
    processorUsed = result.source;
    durationMs    = Date.now() - start;

  } else if (input.mimeType.startsWith("image/")) {
    const start  = Date.now();
    const result = await extractFromImage(input.buffer, input.fileName, input.mimeType);
    rawText       = result.rawText;
    ocrConfidence = result.confidence;
    providerName  = result.provider;
    processorUsed = "image";
    durationMs    = Date.now() - start;

  } else {
    throw new Error(`Unsupported MIME type: ${input.mimeType}`);
  }

  // ── STEP 3: NORMALIZE raw text ───────────────────────────────────────────────
  const normalizedText = fixOcrErrors(rawText);

  // ── STEP 4: EXTRACT fields from raw text (skip if pre-extracted by OcrJson) ─
  let rawFields:    ExtractedFields;
  let fieldScores:  Record<string, number>;
  let parseErrors:  string[];

  if (preExtracted) {
    rawFields   = preExtracted;
    fieldScores = {};
    parseErrors = [];
  } else {
    const extraction = extractFields(normalizedText);
    rawFields   = extraction.fields;
    fieldScores = extraction.fieldScores;
    parseErrors = extraction.parseErrors;
  }

  // ── STEP 3b: NORMALIZE extracted field values ─────────────────────────────
  const normalizedFields = normalizeExtractedFields(rawFields);

  // ── STEP 5: IMPUTE missing fields ────────────────────────────────────────────
  const fileName   = input.kind === "file" ? input.fileName : input.payload.fileName;
  const { fields, imputedKeys, lowConfKeys } = imputeFields(normalizedFields, fileName);

  // ── STEP 6: VALIDATE ─────────────────────────────────────────────────────────
  const validation = validateFields(fields);

  // Merge any heuristic repairs from the validator
  const finalFields: ExtractedFields = { ...fields, ...validation.repairedFields };

  // ── STEP 7: SCORE ─────────────────────────────────────────────────────────────
  const confidence = scoreConfidence(
    ocrConfidence,
    fieldScores,
    validation.issues,
    imputedKeys.length,
  );

  // ── STEP 8: DETERMINE STATUS ──────────────────────────────────────────────────
  const hasErrors   = validation.issues.some((i) => i.severity === "ERROR");
  const hasWarnings = validation.issues.some((i) => i.severity === "WARNING");

  let status: ProcessingStatus;
  if (hasErrors)        status = "FAILED";
  else if (hasWarnings) status = "PARSED_WITH_WARNINGS";
  else                  status = "PARSED";

  return {
    fields:        finalFields,
    confidence,
    status,
    imputedFields: imputedKeys,
    lowConfFields: lowConfKeys,
    issues:        validation.issues,
    rawText:       normalizedText,
    processorUsed,
    providerMeta:  { name: providerName, durationMs },
  };
}
