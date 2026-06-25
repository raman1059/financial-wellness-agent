/**
 * Mock OCR Engine
 *
 * In production this would call AWS Textract, Google Document AI, or Tesseract.
 * For demo it generates realistic payslip text by:
 *   1. Parsing clues from the filename (month, year, amounts)
 *   2. Filling in a template with seeded-random but consistent values
 *
 * The output is plain text that the field extractor then parses — the same
 * pipeline that would process real OCR output.
 */

export interface OcrResult {
  rawText:    string;
  confidence: number;   // 0–1
  provider:   string;
  durationMs: number;
}

// ─── Deterministic "random" seeded on filename ────────────────────────────────

function seed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededFloat(base: number, min = 0, max = 1): number {
  return min + ((base % 1000) / 1000) * (max - min);
}

// ─── Month/year extraction from filename ─────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function extractPeriodFromFilename(name: string): { month: number; year: number } {
  const lower = name.toLowerCase();

  // "payslip_april_2025.pdf", "salary_slip_04_2025.pdf", "2025-04-payslip.pdf"
  const yearMatch = lower.match(/20\d{2}/);
  const year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear();

  for (const [word, num] of Object.entries(MONTH_MAP)) {
    if (lower.includes(word)) return { month: num, year };
  }

  // numeric month: "04_2025", "2025-04"
  const numMonthMatch = lower.match(/[_\-/]0?(\d{1,2})[_\-/]/);
  if (numMonthMatch) {
    const m = Number(numMonthMatch[1]);
    if (m >= 1 && m <= 12) return { month: m, year };
  }

  return { month: new Date().getMonth() + 1, year };
}

// ─── Salary band from filename keywords ───────────────────────────────────────

function inferSalaryBand(name: string, s: number): {
  basic: number; hra: number; special: number; lta: number;
  pf: number; pt: number; tds: number;
} {
  // Provide three bands — the seed picks one deterministically
  const bands = [
    { basic: 85000,  hra: 34000, special: 21000, lta: 5000,  pf: 10200, pt: 200, tds: 12500 },
    { basic: 95000,  hra: 38000, special: 27000, lta: 8000,  pf: 11400, pt: 200, tds: 16000 },
    { basic: 105000, hra: 42000, special: 33000, lta: 10000, pf: 12600, pt: 200, tds: 20000 },
  ];
  return bands[s % bands.length];
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export async function runMockOcr(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<OcrResult> {
  const start = Date.now();

  const s         = seed(fileName);
  const period    = extractPeriodFromFilename(fileName);
  const band      = inferSalaryBand(fileName, s);
  const confidence = seededFloat(s, 0.84, 0.98);

  const gross  = band.basic + band.hra + band.special + band.lta;
  const totalDed = band.pf + band.pt + band.tds;
  const net    = gross - totalDed;

  // Simulate processing time proportional to file size
  const simulatedMs = Math.min(200 + Math.floor(buffer.length / 5000), 1500);
  await new Promise((r) => setTimeout(r, simulatedMs));

  const rawText = `
PAYSLIP
=======
Employer   : TechCorp India Pvt Ltd
Employee   : Arpit Tiwari
Employee ID: EMP-001
Pay Period : ${period.month.toString().padStart(2, "0")}/${period.year}
Designation: Senior Software Engineer
Department : Engineering

EARNINGS
--------
Basic Salary         : INR ${band.basic.toLocaleString("en-IN")}
House Rent Allowance : INR ${band.hra.toLocaleString("en-IN")}
Leave Travel Allow.  : INR ${band.lta.toLocaleString("en-IN")}
Special Allowance    : INR ${band.special.toLocaleString("en-IN")}
Gross Salary         : INR ${gross.toLocaleString("en-IN")}

DEDUCTIONS
----------
Provident Fund       : INR ${band.pf.toLocaleString("en-IN")}
Professional Tax     : INR ${band.pt.toLocaleString("en-IN")}
TDS (Income Tax)     : INR ${band.tds.toLocaleString("en-IN")}
Total Deductions     : INR ${totalDed.toLocaleString("en-IN")}

NET PAY
-------
Net Salary           : INR ${net.toLocaleString("en-IN")}

PAN : XXXXXX1234X
Bank : HDFC Bank, A/C ending 6789
`.trim();

  return {
    rawText,
    confidence,
    provider:   "mock-ocr-v1",
    durationMs: Date.now() - start,
  };
}
