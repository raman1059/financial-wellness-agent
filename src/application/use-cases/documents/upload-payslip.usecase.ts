import { createHash } from "crypto";
import { prisma } from "@/infrastructure/db/prisma/client";
import { mockStorage } from "@/infrastructure/storage/mock-storage";
import { processDocument } from "@/infrastructure/ocr/document-processor";
import { auditService } from "@/infrastructure/audit/db-audit-logger";
import { ValidationError } from "@/lib/errors/app-error";
import type { MockPayslip } from "../../../../mock-data";

// ─── Input ────────────────────────────────────────────────────────────────────

export interface UploadPayslipInput {
  userId:   string;
  file:     File;
}

// ─── Result ───────────────────────────────────────────────────────────────────

export type UploadStatus = "PENDING" | "PROCESSING" | "PARSED" | "VERIFIED" | "FAILED";

export interface UploadPayslipResult {
  id:            string;
  status:        UploadStatus;
  fileName:      string;
  fileSizeBytes: number;
  mimeType:      string;
  ocr: {
    confidence:   number;
    provider:     string;
    durationMs:   number;
    parseErrors:  string[];
    isValid:      boolean;
    issues:       Array<{ code: string; severity: string; message: string }>;
  };
  extractedData: {
    payPeriodMonth:   number | null;
    payPeriodYear:    number | null;
    basicSalary:      number;
    hra:              number;
    lta:              number;
    specialAllowance: number;
    grossSalary:      number;
    providentFund:    number;
    professionalTax:  number;
    tdsDeducted:      number;
    netSalary:        number;
  } | null;
  isDuplicate: boolean;
  existingId:  string | null;
}

// ─── Allowed file types ───────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Use case ─────────────────────────────────────────────────────────────────

export class UploadPayslipUseCase {
  async execute(input: UploadPayslipInput): Promise<UploadPayslipResult> {
    const { userId, file } = input;

    // ── Step 1: File-level validation ────────────────────────────────────────
    this.validateFile(file);

    const buffer   = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    // ── Step 2: Duplicate check ───────────────────────────────────────────────
    const existing = await prisma.payslip.findFirst({ where: { fileHash, userId } });
    if (existing) {
      return this.duplicateResult(existing, file);
    }

    // ── Step 3: Resolve employee ──────────────────────────────────────────────
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new ValidationError("Employee profile not found — complete your profile first");

    // ── Step 4: Persist file in mock storage ──────────────────────────────────
    const fileKey = `${userId}/${Date.now()}-${file.name}`;
    mockStorage.put(fileKey, buffer, file.type, file.name);

    // ── Step 5: Create payslip record in PROCESSING state ────────────────────
    const payslip = await prisma.payslip.create({
      data: {
        employeeId:    employee.id,
        userId,
        fileName:      file.name,
        fileKey,
        fileMimeType:  file.type,
        fileSizeBytes: file.size,
        fileHash,
        status:        "PROCESSING",
      },
    });

    await auditService.log({
      userId,
      action:       "DOCUMENT_UPLOADED",
      resourceType: "Payslip",
      resourceId:   payslip.id,
      metadata:     { fileName: file.name, fileSize: file.size, mimeType: file.type },
    });

    // ── Steps 6-7: Run full document processor (classify→extract→normalize→impute→validate) ─
    const processed = await processDocument({
      kind: "file", buffer, fileName: file.name, mimeType: file.type,
    });

    // ── Step 8: Persist results ───────────────────────────────────────────────
    const finalStatus: UploadStatus = processed.status === "FAILED" ? "FAILED" : "PARSED";
    const f = processed.fields;

    const parsedFields = {
      basicSalary:      f.basicSalary,
      hra:              f.hra,
      lta:              f.lta,
      specialAllowance: f.specialAllowance,
      otherEarnings:    f.otherEarnings,
      grossSalary:      f.grossSalary,
      providentFund:    f.providentFund,
      professionalTax:  f.professionalTax,
      tdsDeducted:      f.tdsDeducted,
      esic:             f.esic,
      otherDeductions:  f.otherDeductions,
      totalDeductions:  f.totalDeductions,
      netSalary:        f.netSalary,
      employerName:     f.employerName,
      imputedFields:    processed.imputedFields,
      lowConfFields:    processed.lowConfFields,
    };

    await prisma.payslip.update({
      where: { id: payslip.id },
      data: {
        status:          finalStatus,
        ocrProvider:     processed.providerMeta.name,
        ocrConfidence:   processed.confidence,
        ocrRawText:      processed.rawText,
        parsedFields,
        parseErrors:     processed.issues.map((i) => `[${i.severity}][${i.code}] ${i.message}`),
        payPeriodMonth:  f.payPeriodMonth ?? undefined,
        payPeriodYear:   f.payPeriodYear  ?? undefined,
        processedAt:     new Date(),
      },
    });

    await auditService.log({
      userId,
      action:       finalStatus === "PARSED" ? "OCR_COMPLETED" : "OCR_FAILED",
      resourceType: "Payslip",
      resourceId:   payslip.id,
      metadata: {
        confidence:      processed.confidence,
        imputedFields:   processed.imputedFields,
        issueCount:      processed.issues.length,
        durationMs:      processed.providerMeta.durationMs,
        processorUsed:   processed.processorUsed,
      },
    });

    return {
      id:            payslip.id,
      status:        finalStatus,
      fileName:      file.name,
      fileSizeBytes: file.size,
      mimeType:      file.type,
      ocr: {
        confidence:  processed.confidence,
        provider:    processed.providerMeta.name,
        durationMs:  processed.providerMeta.durationMs,
        parseErrors: processed.issues.filter((i) => i.severity === "ERROR").map((i) => i.message),
        isValid:     processed.status !== "FAILED",
        issues:      processed.issues,
      },
      extractedData: processed.status !== "FAILED" ? {
        payPeriodMonth:   f.payPeriodMonth,
        payPeriodYear:    f.payPeriodYear,
        basicSalary:      f.basicSalary,
        hra:              f.hra,
        lta:              f.lta,
        specialAllowance: f.specialAllowance,
        grossSalary:      f.grossSalary,
        providentFund:    f.providentFund,
        professionalTax:  f.professionalTax,
        tdsDeducted:      f.tdsDeducted,
        netSalary:        f.netSalary,
      } : null,
      isDuplicate: false,
      existingId:  null,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private validateFile(file: File): void {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new ValidationError(
        `Unsupported file type "${file.type}". Allowed: PDF, PNG, JPEG, WebP`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB`,
      );
    }
    if (file.size === 0) {
      throw new ValidationError("File is empty");
    }
  }

  private duplicateResult(existing: MockPayslip, file: File): UploadPayslipResult {
    return {
      id:            existing.id,
      status:        existing.status as UploadStatus,
      fileName:      file.name,
      fileSizeBytes: file.size,
      mimeType:      file.type,
      ocr: {
        confidence:  existing.ocrConfidence ?? 0,
        provider:    existing.ocrProvider   ?? "none",
        durationMs:  0,
        parseErrors: [],
        isValid:     existing.status === "PARSED" || existing.status === "VERIFIED",
        issues:      [],
      },
      extractedData: existing.parsedFields as UploadPayslipResult["extractedData"],
      isDuplicate:   true,
      existingId:    existing.id,
    };
  }
}

export const uploadPayslipUseCase = new UploadPayslipUseCase();
