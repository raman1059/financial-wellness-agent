import { PrismaAuditLogRepository } from "@/infrastructure/repositories/prisma-audit-log.repository";
import { AuditService } from "@/application/services/audit.service";

const repo = new PrismaAuditLogRepository();
export const auditService = new AuditService(repo);
