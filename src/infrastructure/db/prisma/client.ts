import { mockPrisma } from "../../../../mock-data";

// All persistence is served from in-memory mock data.
// Swap this export for a real PrismaClient when a database is available.
export const prisma = mockPrisma;
