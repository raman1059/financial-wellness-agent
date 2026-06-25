import { NextRequest, NextResponse } from "next/server";
import { uploadPayslipUseCase } from "@/application/use-cases/documents/upload-payslip.usecase";
import { toApiError } from "@/lib/errors/app-error";
import { withPermission } from "@/lib/middleware/with-auth";

/**
 * POST /api/documents/upload
 *
 * Accepts multipart/form-data with a single "file" field.
 * Runs synchronous mock OCR and returns structured results immediately.
 *
 * HTTP status codes:
 *   201 — uploaded and parsed successfully
 *   200 — duplicate file (already uploaded); returns existing record
 *   400 — missing file / empty file
 *   409 — duplicate (treated as 200 for idempotency, kept for explicit detection)
 *   413 — file too large
 *   415 — unsupported MIME type
 *   422 — OCR succeeded but validation failed (fields don't reconcile)
 */
export const POST = withPermission(
  "documents:write:own",
  async (req: NextRequest, _ctx, { userId }) => {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No file provided in form field 'file'" }, { status: 400 });
      }

      const result = await uploadPayslipUseCase.execute({ userId, file });

      // Duplicate: return 200 so client can treat it as a soft success
      if (result.isDuplicate) {
        return NextResponse.json(
          { ...result, message: "File already uploaded — returning existing record" },
          { status: 200 },
        );
      }

      // OCR ran but validation failed — partial result, client can retry or escalate
      if (result.status === "FAILED") {
        return NextResponse.json(
          { ...result, message: "File uploaded but OCR validation failed — review issues[]" },
          { status: 422 },
        );
      }

      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);
