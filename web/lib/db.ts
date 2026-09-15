/**
 * The Prisma client, one per process.
 *
 * Next's dev server re-evaluates a module every time a file it depends on is
 * edited. A bare `new PrismaClient()` here would therefore open a connection
 * pool per save and never close the old ones, and Postgres starts refusing
 * connections a dozen edits into an afternoon. Parking the instance on
 * globalThis survives the reload. Production evaluates this once, so the global
 * is left unset there rather than kept for symmetry.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
