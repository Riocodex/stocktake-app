import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

function createClient() {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL ?? "file:./dev.db",
    }),
  });
}

// Bump this after schema fields are added so a hot-reloaded process does not
// keep serving a PrismaClient that was built against the old shape.
const CLIENT_GENERATION = "stock-movements-v1";

// Next.js hot reloading would otherwise open a new connection on every edit.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
  prismaGeneration?: string;
};

if (globalForPrisma.prismaGeneration !== CLIENT_GENERATION) {
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaGeneration = CLIENT_GENERATION;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
