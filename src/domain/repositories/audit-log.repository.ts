export interface CreateAuditLogInput {
  userId?: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  success?: boolean;
  errorCode?: string;
}

export interface IAuditLogRepository {
  create(input: CreateAuditLogInput): Promise<void>;
}
