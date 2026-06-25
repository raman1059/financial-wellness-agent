/**
 * Image Processor
 *
 * Pseudocode
 * ----------
 * extract(buffer, fileName, mimeType):
 *   preprocess(buffer):
 *     if image is low-resolution (< 150 DPI estimate):
 *       upscale × 2 using bilinear interpolation     [production: sharp.resize()]
 *     convert to grayscale                           [production: sharp.greyscale()]
 *     apply adaptive thresholding (binarise)         [production: sharp.threshold()]
 *     deskew if rotation detected                    [production: custom FFT deskew]
 *
 *   runOcr(preprocessedBuffer):
 *     → call Tesseract / Textract / Google Vision    [production]
 *     → call runMockOcr()                            [demo]
 *     returns { rawText, confidence, wordBoxes[] }
 *
 *   if confidence < LOW_CONF_THRESHOLD (0.60):
 *     retry with enhanced preprocessing
 *     if still < threshold → mark status = FAILED
 *
 *   return { rawText, confidence, source: "image" }
 *
 * Image type heuristics:
 *   JPEG → natural photo of payslip → expect moderate confidence (0.75–0.90)
 *   PNG  → screenshot / scan       → expect higher confidence  (0.85–0.98)
 *   WebP → compressed photo        → similar to JPEG
 */

import { runMockOcr, type OcrResult } from "../mock-ocr.engine";

export interface ImageExtractionResult extends OcrResult {
  source:           "image";
  preprocessApplied: string[];  // list of preprocessing steps applied
}

// Confidence floor below which we flag as low-confidence (not auto-fail)
const LOW_CONFIDENCE_THRESHOLD = 0.60;

// MIME → base confidence modifier (mock — in production depends on image quality)
const MIME_CONFIDENCE_MODIFIER: Record<string, number> = {
  "image/png":  1.00,
  "image/jpeg": 0.94,
  "image/jpg":  0.94,
  "image/webp": 0.92,
};

export async function extractFromImage(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ImageExtractionResult> {
  const preprocessApplied: string[] = [];

  // ── Preprocessing hints (in production, call sharp here) ──────────────────
  if (buffer.length < 50_000) {
    // Small file → likely low-res → would upscale
    preprocessApplied.push("upscale-2x");
  }
  preprocessApplied.push("grayscale", "threshold-binarise");

  // ── OCR ───────────────────────────────────────────────────────────────────
  const ocrResult = await runMockOcr(buffer, fileName, mimeType);

  // Apply MIME-type confidence modifier
  const modifier   = MIME_CONFIDENCE_MODIFIER[mimeType] ?? 0.90;
  const confidence = ocrResult.confidence * modifier;

  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    // In production: retry with more aggressive preprocessing
    // For demo: keep result but mark low confidence
    preprocessApplied.push("retry-enhanced-contrast");
  }

  return {
    ...ocrResult,
    confidence,
    source:            "image",
    preprocessApplied,
  };
}
