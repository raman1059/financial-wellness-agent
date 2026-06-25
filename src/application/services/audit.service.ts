import type { IAuditLogRepository, CreateAuditLogInput } from "@/domain/repositories/audit-log.repository";
import {
  type AuditAction,
  type AuditMetadataMap,
  ACTION_SEVERITY,
} from "@/domain/audit/audit-events";

// ─── Request context (extracted from HTTP headers) ────────────────────────────

export interface RequestContext {
  ipAddress?:  string;
  userAgent?:  string;
  requestId?:  string;
}

// ─── Base call context (common to all log calls) ──────────────────────────────

export interface LogContext extends RequestContext {
  userId?:      string;
  actorId?:     string;
  resourceType?: string;
  resourceId?:   string;
  success?:      boolean;
  errorCode?:    string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AuditService {
  constructor(private readonly repo: IAuditLogRepository) {}

  /**
   * Untyped escape-hatch for legacy call sites or one-off events.
   * Prefer logEvent() for all new code.
   */
  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.repo.create(input);
    } catch {
      // Audit failures must never crash the main flow
    }
  }

  /**
   * Strongly-typed event logger.
   *
   * `action` constrains `metadata` to the exact shape declared in AuditMetadataMap —
   * missing or extra fields are caught by the TypeScript compiler, not at runtime.
   *
   * Severity is resolved automatically from ACTION_SEVERITY; callers cannot
   * accidentally log a CRITICAL event as INFO.
   *
   * Usage:
   *   await auditService.logEvent("AUTH_LOGIN_SUCCESS", { method: "credentials" }, {
   *     userId: user.id, ipAddress: ctx.ipAddress,
   *   });
   */
  async logEvent<A extends AuditAction>(
    action:   A,
    metadata: AuditMetadataMap[A],
    context:  LogContext = {},
  ): Promise<void> {
    try {
      await this.repo.create({
        action,
        metadata: {
          ...metadata,
          _severity: ACTION_SEVERITY[action],   // baked into metadata for cheap querying
        } as Record<string, unknown>,
        userId:       context.userId,
        actorId:      context.actorId,
        resourceType: context.resourceType,
        resourceId:   context.resourceId,
        ipAddress:    context.ipAddress,
        userAgent:    context.userAgent,
        requestId:    context.requestId,
        success:      context.success ?? true,
        errorCode:    context.errorCode,
      });
    } catch {
      // Audit failures must never crash the main flow
    }
  }
}
