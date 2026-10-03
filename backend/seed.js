require('dotenv').config();
const prisma = require('./src/db/prisma');
const argon2 = require('argon2');

async function main() {
    console.log('Starting seed...');

    // Clean up existing data for testing if you want, or just create if missing
    // We'll use upsert for idempotency

    // 1. Create Organization
    const org = await prisma.organization.upsert({
        where: { slug: 'spaceezy-demo' },
        update: {},
        create: {
            name: 'SpaceEzy Demo Organization',
            slug: 'spaceezy-demo',
        },
    });
    console.log(`Organization created: ${org.id}`);

    const passwordHash = await argon2.hash('password123');

    // 2. Create Admin
    const admin = await prisma.user.upsert({
        where: {
            organizationId_email: {
                organizationId: org.id,
                email: 'admin@spaceezy.com'
            }
        },
        update: {},
        create: {
            organizationId: org.id,
            name: 'Admin User',
            email: 'admin@spaceezy.com',
            phone: '1234567890',
            passwordHash,
            role: 'ADMIN'
        }
    });
    console.log(`Admin created: ${admin.email}`);

    // 3. Create Employee 1
    const emp1 = await prisma.user.upsert({
        where: {
            organizationId_email: {
                organizationId: org.id,
                email: 'emp1@spaceezy.com'
            }
        },
        update: {},
        create: {
            organizationId: org.id,
            name: 'John Doe',
            email: 'emp1@spaceezy.com',
            phone: '9876543210',
            passwordHash,
            role: 'SALES_EXECUTIVE'
        }
    });
    console.log(`Employee 1 created: ${emp1.email}`);

    // 4. Create Employee 2
    const emp2 = await prisma.user.upsert({
        where: {
            organizationId_email: {
                organizationId: org.id,
                email: 'emp2@spaceezy.com'
            }
        },
        update: {},
        create: {
            organizationId: org.id,
            name: 'Jane Smith',
            email: 'emp2@spaceezy.com',
            phone: '5555555555',
            passwordHash,
            role: 'SALES_EXECUTIVE'
        }
    });
    console.log(`Employee 2 created: ${emp2.email}`);

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
