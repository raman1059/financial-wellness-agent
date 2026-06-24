import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/infrastructure/db/prisma/client";
import { PrismaPayrollRepository } from "@/infrastructure/repositories/prisma-payroll.repository";
import { CreatePayrollRecordUseCase } from "@/application/use-cases/payroll/create-payroll-record.usecase";
import { PrismaAuditLogRepository } from "@/infrastructure/repositories/prisma-audit-log.repository";
import { AuditService } from "@/application/services/audit.service";
import { createPayrollSchema } from "@/lib/validation/schemas/payroll.schema";
import { toApiError } from "@/lib/errors/app-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const records = await prisma.payrollRecord.findMany({
    where: { userId: session.user.id },
    orderBy: [{ payPeriodYear: "desc" }, { payPeriodMonth: "desc" }],
  });
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const input = createPayrollSchema.parse(body);

    const employee = await prisma.employee.findUnique({ where: { userId: session.user.id } });
    if (!employee) return NextResponse.json({ error: "Employee profile not found" }, { status: 404 });

    const repo = new PrismaPayrollRepository();
    const auditRepo = new PrismaAuditLogRepository();
    const useCase = new CreatePayrollRecordUseCase(repo, new AuditService(auditRepo));
    const record = await useCase.execute(session.user.id, employee.id, input);

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    const { error, status } = toApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
