import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/prisma/client";
import { toApiError } from "@/lib/errors/app-error";
import { withAuth } from "@/lib/middleware/with-auth";

/**
 * GET /api/documents?status=PARSED&page=1&limit=20
 * Lists all payslips for the authenticated user, newest first.
 */
export const GET = withAuth(async (req: NextRequest, _ctx, { userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 100);

    const where = {
      userId,
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [payslips, total] = await Promise.all([
      prisma.payslip.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: limit,
      }),
      prisma.payslip.count({ where }),
    ]);

    const records = payslips.map((p) => ({
      id:            p.id,
      fileName:      p.fileName,
      mimeType:      p.fileMimeType,
      fileSizeBytes: p.fileSizeBytes,
      status:        p.status,
      ocrConfidence: p.ocrConfidence,
      payPeriodMonth: p.payPeriodMonth,
      payPeriodYear:  p.payPeriodYear,
      processedAt:   p.processedAt,
      createdAt:     p.createdAt,
      // Omit ocrRawText and parsedFields from list view for payload efficiency
    }));

    return NextResponse.json({ records, total, limit });
  } catch (err) {
    const { error, status } = toApiError(err);
    return NextResponse.json({ error }, { status });
  }
});
