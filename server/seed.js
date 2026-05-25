import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Super Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@organization.com' },
    update: {},
    create: {
      email: 'admin@organization.com',
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      department: 'Management',
      permissions: 'read,write,delete'
    },
  });

  // Create some users
  await prisma.user.upsert({
    where: { email: 'jane@organization.com' },
    update: {},
    create: {
      email: 'jane@organization.com',
      name: 'Jane Smith',
      role: 'USER',
      department: 'Engineering',
      permissions: 'read'
    },
  });

  await prisma.user.upsert({
    where: { email: 'john@organization.com' },
    update: {},
    create: {
      email: 'john@organization.com',
      name: 'John Doe',
      role: 'USER',
      department: 'Sales',
      permissions: 'read'
    },
  });

  // Create holidays
  const holidays = [
    { date: 'Jan 1, 2026', name: "New Year's Day" },
    { date: 'Jan 26, 2026', name: 'Republic Day' },
    { date: 'Aug 15, 2026', name: 'Independence Day' },
    { date: 'Oct 2, 2026', name: 'Gandhi Jayanti' },
    { date: 'Dec 25, 2026', name: 'Christmas' },
  ];

  for (const holiday of holidays) {
    await prisma.holiday.create({
      data: holiday,
    });
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
