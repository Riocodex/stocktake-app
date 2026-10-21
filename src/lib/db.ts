import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

function createClient() {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL ?? "file:./dev.db",
    }),
  });
}

// Bump this after schema fields/models are added so a hot-reloaded process does
// not keep serving a PrismaClient that was built against the old shape.
const CLIENT_GENERATION = "invoice-receiving-v3-onestep";

function clientHasPurchasingModels(
  client: ReturnType<typeof createClient> | undefined,
): client is ReturnType<typeof createClient> {
  // Webpack HMR can keep a PrismaClient whose generation string matches but
  // whose delegates predate `prisma generate`.
  const supplier = (
    client as { supplier?: { findFirst?: unknown } } | undefined
  )?.supplier;
  const invoice = (
    client as { invoice?: { findFirst?: unknown } } | undefined
  )?.invoice;
  return (
    typeof supplier?.findFirst === "function" &&
    typeof invoice?.findFirst === "function"
  );
}

// Next.js hot reloading would otherwise open a new connection on every edit.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
  prismaGeneration?: string;
};

if (
  globalForPrisma.prismaGeneration !== CLIENT_GENERATION ||
  !clientHasPurchasingModels(globalForPrisma.prisma)
) {
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaGeneration = CLIENT_GENERATION;
}

export const prisma =
  globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
