import { PrismaClient, RoleName } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  for (const name of [RoleName.collector, RoleName.artist, RoleName.admin]) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
