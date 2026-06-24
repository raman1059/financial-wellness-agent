import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/infrastructure/db/prisma/client";
import { toApiError } from "@/lib/errors/app-error";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const record = await prisma.payrollRecord.findFirst({ where: { id, userId: session.user.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(record);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    await prisma.payrollRecord.deleteMany({ where: { id, userId: session.user.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const { error, status } = toApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
