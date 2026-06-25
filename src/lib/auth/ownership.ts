import { prisma } from "@/infrastructure/db/prisma/client";
import { ForbiddenError, NotFoundError } from "@/lib/errors/app-error";
import { canAccessAny, type UserRole } from "./rbac";

type ResourceType = "payrollRecord" | "payslip" | "chatSession" | "taxDeclaration";

/**
 * Verifies that `callerId` owns the resource identified by `resourceId`.
 * ADMINs and ACCOUNTANTs bypass the check (they hold :any permission).
 * Throws NotFoundError (404) if the record does not exist.
 * Throws ForbiddenError (403) if a USER tries to access another user's record.
 */
export async function assertOwnership(
  callerId: string,
  callerRole: UserRole,
  resourceId: string,
  resourceType: ResourceType,
): Promise<void> {
  if (canAccessAny(callerRole)) return;

  const record = await fetchResource(resourceId, resourceType);

  if (!record) {
    throw new NotFoundError(`${resourceType} ${resourceId} not found`);
  }

  if (record.userId !== callerId) {
    throw new ForbiddenError("You do not have access to this resource");
  }
}

async function fetchResource(
  id: string,
  type: ResourceType,
): Promise<{ userId: string } | null> {
  switch (type) {
    case "payrollRecord":
      return prisma.payrollRecord.findFirst({ where: { id } });
    case "payslip":
      return prisma.payslip.findFirst({ where: { id } });
    case "chatSession":
      return prisma.chatSession.findFirst({ where: { id } });
    case "taxDeclaration":
      return prisma.taxDeclaration.findFirst({ where: { id } });
  }
}
