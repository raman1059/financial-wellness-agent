import { inngest } from "./inngest-client";
import { prisma } from "@/infrastructure/db/prisma/client";
import { mockStorage } from "@/infrastructure/storage/mock-storage";
import { runMockOcr } from "@/infrastructure/ocr/mock-ocr.engine";
import { extractFields } from "@/infrastructure/ocr/field-extractor";
import { validateFields } from "@/infrastructure/ocr/field-validator";
import { auditService } from "@/infrastructure/audit/db-audit-logger";

/**
 * Background job: async OCR processing triggered via Inngest event.
 *
 * In production this handles large files or queue-based processing.
 * For demo uploads the use-case runs OCR synchronously, so this job
 * only fires if someone explicitly sends the "payslip/uploaded" event.
 *
 * Steps are idempotent — Inngest can retry any step independently.
 */
export const processDocumentJob = inngest.createFunction(
  { id: "process-payslip-ocr", name: "Process Payslip OCR", retries: 3 },
  { event: "payslip/uploaded" },
  async ({ event, step }) => {
    const { payslipId, userId } = event.data as { payslipId: string; userId: string };

    // ── Step 1: mark PROCESSING ──────────────────────────────────────────────
    await step.run("mark-processing", async () => {
      await prisma.payslip.update({
        where: { id: payslipId },
        data:  { status: "PROCESSING" },
      });
    });

    // ── Step 2: load file from mock storage ───────────────────────────────────
    const fileInfo = await step.run("load-file", async () => {
      const payslip = await prisma.payslip.findFirst({ where: { id: payslipId } });
      if (!payslip) throw new Error(`Payslip ${payslipId} not found`);

      const stored = mockStorage.get(payslip.fileKey);
      return {
        buffer:   stored?.buffer ?? Buffer.alloc(0),
        fileName: payslip.fileName,
        mimeType: payslip.fileMimeType,
      };
    });

    // ── Step 3: run OCR ───────────────────────────────────────────────────────
    const ocrResult = await step.run("run-ocr", async () => {
      return runMockOcr(fileInfo.buffer, fileInfo.fileName, fileInfo.mimeType);
    });

    // ── Step 4: extract + validate fields ─────────────────────────────────────
    const { fields, parseErrors } = extractFields(ocrResult.rawText);
    const validation = validateFields(fields);
    const finalFields = { ...fields, ...validation.repairedFields };
    const finalStatus = validation.isValid ? "PARSED" : "FAILED";
    const confidence  = ocrResult.confidence * validation.overallScore;

    // ── Step 5: persist results ───────────────────────────────────────────────
    await step.run("save-results", async () => {
      await prisma.payslip.update({
        where: { id: payslipId },
        data: {
          status:         finalStatus,
          ocrProvider:    ocrResult.provider,
          ocrConfidence:  confidence,
          ocrRawText:     ocrResult.rawText,
          parsedFields: {
            basicSalary:      finalFields.basicSalary,
            hra:              finalFields.hra,
            lta:              finalFields.lta,
            specialAllowance: finalFields.specialAllowance,
            grossSalary:      finalFields.grossSalary,
            providentFund:    finalFields.providentFund,
            professionalTax:  finalFields.professionalTax,
            tdsDeducted:      finalFields.tdsDeducted,
            netSalary:        finalFields.netSalary,
          },
          parseErrors:    [
            ...parseErrors,
            ...validation.issues.map((i) => `[${i.code}] ${i.message}`),
          ],
          payPeriodMonth: finalFields.payPeriodMonth ?? undefined,
          payPeriodYear:  finalFields.payPeriodYear  ?? undefined,
          processedAt:    new Date(),
        },
      });

      await auditService.log({
        userId,
        action:       finalStatus === "PARSED" ? "OCR_COMPLETED" : "OCR_FAILED",
        resourceType: "Payslip",
        resourceId:   payslipId,
        metadata:     { confidence, durationMs: ocrResult.durationMs },
      });
    });

    return { payslipId, status: finalStatus, confidence };
  },
);
