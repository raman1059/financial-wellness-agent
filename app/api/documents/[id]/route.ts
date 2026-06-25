import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/prisma/client";
import { toApiError } from "@/lib/errors/app-error";
import { withPermission } from "@/lib/middleware/with-auth";
import { assertOwnership } from "@/lib/auth/ownership";

/**
 * GET /api/documents/:id
 * Status polling endpoint — client polls this after upload to track OCR progress.
 * In production the status would transition asynchronously via Inngest;
 * for demo it is immediately set by the upload handler.
 */
export const GET = withPermission(
  "documents:read:own",
  async (_req: NextRequest, ctx, { userId, role }) => {
    try {
      const { id } = await ctx.params;
      await assertOwnership(userId, role, id, "payslip");

      const payslip = await prisma.payslip.findFirst({ where: { id } });
      if (!payslip) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      return NextResponse.json({
        id:            payslip.id,
        fileName:      payslip.fileName,
        mimeType:      payslip.fileMimeType,
        fileSizeBytes: payslip.fileSizeBytes,
        status:        payslip.status,
        ocrProvider:   payslip.ocrProvider,
        ocrConfidence: payslip.ocrConfidence,
        parsedFields:  payslip.parsedFields,
        parseErrors:   payslip.parseErrors,
        payPeriodMonth: payslip.payPeriodMonth,
        payPeriodYear:  payslip.payPeriodYear,
        processedAt:   payslip.processedAt,
        createdAt:     payslip.createdAt,
      });
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);

/**
 * DELETE /api/documents/:id
 * Soft-deletes by setting status to FAILED.
 * Hard-delete only via admin tool to preserve audit trail.
 */
export const DELETE = withPermission(
  "documents:delete:own",
  async (_req: NextRequest, ctx, { userId, role }) => {
    try {
      const { id } = await ctx.params;
      await assertOwnership(userId, role, id, "payslip");

      await prisma.payslip.update({
        where: { id },
        data:  { status: "FAILED" },
      });

      return new NextResponse(null, { status: 204 });
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);
