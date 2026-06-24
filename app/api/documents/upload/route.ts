import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/infrastructure/db/prisma/client";
import { createHash } from "crypto";
import { auditService } from "@/infrastructure/audit/db-audit-logger";

const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } });
  if (!employee) return NextResponse.json({ error: "Employee profile not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  // Check for duplicate
  const existing = await prisma.payslip.findFirst({ where: { fileHash, userId: session.user.id } });
  if (existing) return NextResponse.json({ error: "Duplicate document already uploaded", id: existing.id }, { status: 409 });

  // In production: upload buffer to Supabase Storage and get the key
  // For demo: store a placeholder key
  const fileKey = `${session.user.id}/${Date.now()}-${file.name}`;

  const payslip = await prisma.payslip.create({
    data: {
      employeeId: employee.id,
      userId: session.user.id,
      fileName: file.name,
      fileKey,
      fileMimeType: file.type,
      fileSizeBytes: file.size,
      fileHash,
      status: "PENDING",
    },
  });

  await auditService.log({
    userId: session.user.id,
    action: "DOCUMENT_UPLOADED",
    resourceType: "Payslip",
    resourceId: payslip.id,
    metadata: { fileName: file.name, fileSize: file.size },
  });

  // In production: send inngest event to trigger OCR
  // await inngest.send({ name: "payslip/uploaded", data: { payslipId: payslip.id, userId: session.user.id } });

  return NextResponse.json({ id: payslip.id, status: "PENDING" }, { status: 201 });
}
