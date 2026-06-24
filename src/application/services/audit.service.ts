import type { IAuditLogRepository, CreateAuditLogInput } from "@/domain/repositories/audit-log.repository";

export class AuditService {
  constructor(private readonly repo: IAuditLogRepository) {}

  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.repo.create(input);
    } catch {
      // Audit failures must never crash the main flow
    }
  }
}
