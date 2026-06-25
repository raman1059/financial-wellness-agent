/**
 * PDF Processor
 *
 * Pseudocode
 * ----------
 * extract(buffer, fileName):
 *   attempt extractTextLayer(buffer)
 *     → parse PDF byte stream for embedded text operators (BT...ET blocks)
 *     → join tokens into readable lines
 *
 *   if textLayer.length < MIN_CHARS (< 50):
 *     # Scanned PDF — no embedded text; treat as image
 *     fallback → ImageProcessor.extract(buffer, fileName)
 *     tag result as source="pdf-scanned"
 *   else:
 *     # Native PDF with text layer
 *     confidence = 0.97   (text layer is near-perfect)
 *     tag result as source="pdf-native"
 *
 *   return { rawText, confidence, source }
 *
 * Note: In production, use pdfjs-dist (Mozilla's PDF.js) for text extraction.
 * In demo mode we generate mock text the same way the image processor does,
 * but with higher confidence to simulate the text-layer advantage.
 */

import { runMockOcr, type OcrResult } from "../mock-ocr.engine";

export interface PdfExtractionResult extends OcrResult {
  source: "pdf-native" | "pdf-scanned";
}

const MIN_TEXT_LENGTH = 50;

/**
 * Attempt to extract the text layer from a PDF buffer.
 * In production: import { getDocument } from "pdfjs-dist/legacy/build/pdf.js"
 * In demo: simulate by checking if the buffer contains PDF text markers.
 */
function extractTextLayer(buffer: Buffer): string {
  const str = buffer.toString("latin1");

  // Real PDFs with text layers contain "BT" (Begin Text) markers
  // and string operators like "(Hello)" or "<48656C6C6F>"
  const hasBtBlocks = /BT[\s\S]*?ET/.test(str);
  if (!hasBtBlocks) return "";

  // Extract parenthesised text strings (simplified — pdfjs handles this properly)
  const tokens: string[] = [];
  const matches = str.matchAll(/\(([^)]{1,200})\)\s*Tj/g);
  for (const m of matches) {
    const text = m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")");
    tokens.push(text);
  }

  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

export async function extractFromPdf(
  buffer: Buffer,
  fileName: string,
): Promise<PdfExtractionResult> {
  const textLayer = extractTextLayer(buffer);

  if (textLayer.length >= MIN_TEXT_LENGTH) {
    // Native PDF: very high confidence since there's no OCR involved
    return {
      rawText:    textLayer,
      confidence: 0.97,
      provider:   "pdf-text-layer",
      durationMs: 10,
      source:     "pdf-native",
    };
  }

  // Scanned PDF: fall back to image OCR with a small confidence penalty
  const ocrResult = await runMockOcr(buffer, fileName, "application/pdf");
  return {
    ...ocrResult,
    confidence: ocrResult.confidence * 0.92, // scanned PDFs lose some fidelity
    source:     "pdf-scanned",
  };
}
