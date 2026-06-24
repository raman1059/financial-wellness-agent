import type { IAuditLogRepository, CreateAuditLogInput } from "@/domain/repositories/audit-log.repository";
import { prisma } from "@/infrastructure/db/prisma/client";

export class PrismaAuditLogRepository implements IAuditLogRepository {
  async create(input: CreateAuditLogInput): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata as never,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
        success: input.success ?? true,
        errorCode: input.errorCode,
      },
    });
  }
}
