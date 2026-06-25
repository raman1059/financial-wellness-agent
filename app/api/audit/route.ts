/**
 * GET /api/audit
 *
 * Queryable audit log endpoint for operations teams and compliance auditors.
 *
 * ── Access control ────────────────────────────────────────────────────────────
 * Requires "audit:read" permission — only ADMIN and ACCOUNTANT roles.
 * The userId filter defaults to the caller's own ID for ACCOUNTANT;
 * ADMIN may query any userId.
 *
 * ── Query parameters ──────────────────────────────────────────────────────────
 * action       Filter by exact action name (e.g. AUTH_LOGIN_FAILURE)
 * userId       Filter by subject user — ACCOUNTANT is forced to their own ID
 * severity     INFO | WARN | ERROR | CRITICAL (post-filter via ACTION_SEVERITY)
 * resourceType Filter by resource (PayrollRecord, Payslip, ChatSession, ...)
 * success      true | false
 * from         ISO date — logs on or after this date
 * to           ISO date — logs on or before this date
 * regulation   DPDP | SOC2 | ISO27001 — logs tagged for that regulation
 * limit        Max 100, default 50
 * page         1-based page number, default 1
 *
 * ── Response ──────────────────────────────────────────────────────────────────
 * Each log entry is enriched with:
 *   severity        — from ACTION_SEVERITY (authoritative, not stored)
 *   complianceTags  — from ACTION_COMPLIANCE_TAGS
 *   description     — plain-English summary from ACTION_DESCRIPTIONS
 */

import { NextRequest, NextResponse }                from "next/server";
import { withPermission }                           from "@/lib/middleware/with-auth";
import { toApiError }                               from "@/lib/errors/app-error";
import { prisma }                                   from "@/infrastructure/db/prisma/client";
import {
  ACTION_SEVERITY,
  ACTION_COMPLIANCE_TAGS,
  ACTION_DESCRIPTIONS,
  type AuditAction,
  type AuditSeverity,
  type ComplianceRegulation,
} from "@/domain/audit/audit-events";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_VALUES: AuditSeverity[] = ["INFO", "WARN", "ERROR", "CRITICAL"];

function enrichLog(log: {
  id: string;
  userId: string | null;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  success: boolean;
  errorCode: string | null;
  createdAt: Date;
}) {
  const action = log.action as AuditAction;
  return {
    ...log,
    createdAt:      log.createdAt.toISOString(),
    severity:       ACTION_SEVERITY[action]          ?? "INFO",
    complianceTags: ACTION_COMPLIANCE_TAGS[action]   ?? [],
    description:    ACTION_DESCRIPTIONS[action]      ?? log.action,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const GET = withPermission(
  "audit:read",
  async (req: NextRequest, _ctx, { userId: callerId, role }) => {
    const { searchParams } = new URL(req.url);

    // ── Parse params ────────────────────────────────────────────────────────
    const actionFilter     = searchParams.get("action") ?? undefined;
    const userIdFilter     = searchParams.get("userId") ?? undefined;
    const severityFilter   = searchParams.get("severity") as AuditSeverity | null;
    const resourceTypeFilter = searchParams.get("resourceType") ?? undefined;
    const successFilter    = searchParams.get("success");
    const fromFilter       = searchParams.get("from");
    const toFilter         = searchParams.get("to");
    const regulationFilter = searchParams.get("regulation") as ComplianceRegulation | null;
    const limit            = Math.min(Number(searchParams.get("limit") ?? 50), 100);
    const page             = Math.max(Number(searchParams.get("page") ?? 1), 1);

    // Validate params
    if (severityFilter && !SEVERITY_VALUES.includes(severityFilter)) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${SEVERITY_VALUES.join(", ")}`, code: "INVALID_PARAM" },
        { status: 400 },
      );
    }
    if (fromFilter && isNaN(Date.parse(fromFilter))) {
      return NextResponse.json({ error: "Invalid 'from' date", code: "INVALID_PARAM" }, { status: 400 });
    }
    if (toFilter && isNaN(Date.parse(toFilter))) {
      return NextResponse.json({ error: "Invalid 'to' date", code: "INVALID_PARAM" }, { status: 400 });
    }

    // ── Scope user filter ────────────────────────────────────────────────────
    // ACCOUNTANT can only see their own logs even if they pass a userId param
    const effectiveUserId =
      role === "ADMIN" ? userIdFilter : callerId;

    // ── Build where clause ───────────────────────────────────────────────────
    const where: Record<string, unknown> = {};

    if (effectiveUserId)     where.userId       = effectiveUserId;
    if (actionFilter)        where.action        = actionFilter;
    if (resourceTypeFilter)  where.resourceType  = resourceTypeFilter;
    if (successFilter !== null && successFilter !== undefined) {
      where.success = successFilter === "true";
    }
    if (fromFilter || toFilter) {
      where.createdAt = {
        ...(fromFilter ? { gte: new Date(fromFilter) } : {}),
        ...(toFilter   ? { lte: new Date(toFilter + "T23:59:59.999Z") } : {}),
      };
    }

    try {
      // ── Fetch all matching logs, then post-filter by severity/regulation ──
      // (These derived fields aren't stored — computed from action string.)
      const [allLogs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          // Fetch extra rows for post-filtering. In production, materialise
          // severity as a DB column and filter at query time.
          take: (severityFilter || regulationFilter) ? 1000 : limit,
          skip: (severityFilter || regulationFilter) ? 0 : (page - 1) * limit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      // Post-filter by derived severity
      let filtered = allLogs.map(enrichLog);

      if (severityFilter) {
        filtered = filtered.filter((l) => l.severity === severityFilter);
      }
      if (regulationFilter) {
        filtered = filtered.filter((l) =>
          (l.complianceTags as string[]).includes(regulationFilter),
        );
      }

      // Re-paginate after post-filter if we over-fetched
      const paginatedLogs = (severityFilter || regulationFilter)
        ? filtered.slice((page - 1) * limit, page * limit)
        : filtered;

      const effectiveTotal = (severityFilter || regulationFilter)
        ? filtered.length
        : total;

      return NextResponse.json(
        {
          logs: paginatedLogs,
          pagination: {
            total:      effectiveTotal,
            page,
            limit,
            totalPages: Math.ceil(effectiveTotal / limit),
          },
          filters: {
            action:       actionFilter,
            userId:       effectiveUserId,
            severity:     severityFilter,
            resourceType: resourceTypeFilter,
            success:      successFilter !== null ? successFilter === "true" : undefined,
            from:         fromFilter,
            to:           toFilter,
            regulation:   regulationFilter,
          },
        },
        { status: 200 },
      );
    } catch (err) {
      const { error, status } = toApiError(err);
      return NextResponse.json({ error }, { status });
    }
  },
);
