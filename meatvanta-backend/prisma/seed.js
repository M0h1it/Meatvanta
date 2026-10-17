require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { hashPassword } = require("../src/utils/password.util");

const prisma = new PrismaClient();

// System roles - always present, never deletable. Custom roles are created
// later through the admin UI (Roles feature) and stored purely in the DB.
const SYSTEM_ROLES = [
  { name: "owner", label: "Owner", permissions: ["*"] },
  {
    name: "manager",
    label: "Manager",
    permissions: [
      "products:*",
      "categories:*",
      "roles:view",
      "admin_users:view",
      "orders:*",
      "delivery_settings:*",
      "coupons:*",
      "reports:view",
      "audit_log:view",
      "notifications:*",
      "customers:view",
      "shop_info:*",
      "delivery:*",
    ],
  },
  {
    name: "staff",
    label: "Staff",
    permissions: [
      "orders:create",
      "orders:view",
      "orders:updateStatus",
      "products:view",
      "products:toggleStock",
      "categories:view",
      "notifications:*",
    ],
  },
];

async function seedRoles() {
  const roles = {};
  for (const roleData of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: { label: roleData.label, permissions: roleData.permissions, isSystem: true },
      create: { ...roleData, isSystem: true },
    });
    roles[role.name] = role;
    console.log(`Role ready: ${role.name}`);
  }
  return roles;
}

async function main() {
  const roles = await seedRoles();

  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME || "Owner";

  if (!email || !password) {
    throw new Error("Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in .env before seeding.");
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user ${email} already exists - skipping.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.create({
    data: { name, email, passwordHash, roleId: roles.owner.id, isActive: true },
  });

  console.log(`Created owner admin: ${admin.email} (id ${admin.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
