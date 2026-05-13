import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

const { NODE_ENV } = process.env;

if (NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
