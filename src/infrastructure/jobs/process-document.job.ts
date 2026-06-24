import { inngest } from "./inngest-client";
import { prisma } from "@/infrastructure/db/prisma/client";
import { auditService } from "@/infrastructure/audit/db-audit-logger";

export const processDocumentJob = inngest.createFunction(
  { id: "process-payslip-ocr", name: "Process Payslip OCR" },
  { event: "payslip/uploaded" },
  async ({ event, step }) => {
    const { payslipId, userId } = event.data as { payslipId: string; userId: string };

    await step.run("mark-processing", async () => {
      await prisma.payslip.update({
        where: { id: payslipId },
        data: { status: "PROCESSING" },
      });
    });

    // OCR processing would go here — call Tesseract or Textract
    // For demo, we simulate a successful parse
    const parsedFields = await step.run("run-ocr", async () => {
      await new Promise((r) => setTimeout(r, 1000)); // simulated delay
      return {
        employerName: "TechCorp India Pvt Ltd",
        grossSalary: 140000,
        netSalary: 117100,
        tdsDeducted: 12500,
        basicSalary: 85000,
        hra: 34000,
        pfDeducted: 10200,
      };
    });

    await step.run("save-results", async () => {
      await prisma.payslip.update({
        where: { id: payslipId },
        data: {
          status: "PARSED",
          ocrProvider: "tesseract",
          ocrConfidence: 0.92,
          parsedFields,
          processedAt: new Date(),
        },
      });

      await auditService.log({
        userId,
        action: "OCR_COMPLETED",
        resourceType: "Payslip",
        resourceId: payslipId,
        metadata: { confidence: 0.92 },
      });
    });

    return { payslipId, status: "PARSED" };
  },
);
