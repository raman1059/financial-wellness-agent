import { randomUUID }  from "crypto";
import { NextRequest }  from "next/server";
import type { RequestContext } from "@/application/services/audit.service";

/**
 * Extracts the three fields that make every audit log entry traceable:
 *   ipAddress  — real client IP from proxy headers
 *   userAgent  — browser / SDK identifier
 *   requestId  — caller-supplied or freshly generated; used to correlate
 *                all log entries from a single HTTP request
 *
 * Pass the result as the third argument to auditService.logEvent().
 */
export function extractRequestContext(req: NextRequest): RequestContext {
  // x-forwarded-for may contain a comma-separated chain; first is the real client
  const forwarded = req.headers.get("x-forwarded-for");
  const ipAddress = forwarded
    ? forwarded.split(",")[0].trim()
    : (req.headers.get("x-real-ip") ?? "unknown");

  return {
    ipAddress,
    userAgent:  req.headers.get("user-agent") ?? undefined,
    requestId:  req.headers.get("x-request-id") ?? randomUUID(),
  };
}
