const prisma = require("../../config/db");
const { hashPassword } = require("../../utils/password.util");

function notFoundError(message) {
  const err = new Error(message);
  err.statusCode = 404;
  err.expose = true;
  return err;
}
function conflictError(message) {
  const err = new Error(message);
  err.statusCode = 409;
  err.expose = true;
  return err;
}

const adminInclude = { role: { select: { id: true, name: true, label: true } } };

function stripPasswordHash(admin) {
  const { passwordHash, ...safeAdmin } = admin;
  return safeAdmin;
}

async function createAdminUser({ name, email, password, roleId, phone }) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw notFoundError("roleId does not match any existing role.");

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) throw conflictError("An admin with this email already exists.");

  const cleanPhone = phone ? String(phone).trim() : null;
  if (cleanPhone) {
    // phone is @unique in the schema - answer 409 instead of letting the DB error become a 500.
    const phoneTaken = await prisma.adminUser.findUnique({ where: { phone: cleanPhone } });
    if (phoneTaken) throw conflictError("An admin with this phone number already exists.");
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.adminUser.create({
    data: { name: name.trim(), email, passwordHash, roleId, phone: cleanPhone },
    include: adminInclude,
  });

  return stripPasswordHash(admin);
}

async function listAdminUsers() {
  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    include: adminInclude,
  });
  return admins.map(stripPasswordHash);
}

async function getAdminUserById(id) {
  const admin = await prisma.adminUser.findUnique({ where: { id }, include: adminInclude });
  if (!admin) throw notFoundError("Admin user not found.");
  return stripPasswordHash(admin);
}

async function updateAdminUser(id, { name, roleId, isActive, phone }, actingAdminId) {
  const existing = await prisma.adminUser.findUnique({ where: { id }, include: { role: true } });
  if (!existing) throw notFoundError("Admin user not found.");

  // Guard against the last active owner locking everyone out by demoting or
  // deactivating themselves with no other owner left to fix it.
  const isSelfDemotingOrDeactivating =
    id === actingAdminId && existing.role.name === "owner" && (roleId !== undefined || isActive === false);

  if (isSelfDemotingOrDeactivating) {
    const activeOwnerCount = await prisma.adminUser.count({
      where: { role: { name: "owner" }, isActive: true },
    });
    if (activeOwnerCount <= 1) {
      const err = new Error(
        "You're the only active owner - promote another admin to owner before changing this."
      );
      err.statusCode = 409;
      err.expose = true;
      throw err;
    }
  }

  if (roleId !== undefined) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw notFoundError("roleId does not match any existing role.");
  }

  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (roleId !== undefined) data.roleId = roleId;
  if (isActive !== undefined) data.isActive = isActive;
  if (phone !== undefined) {
    const cleanPhone = phone ? String(phone).trim() : null;
    if (cleanPhone) {
      const phoneTaken = await prisma.adminUser.findUnique({ where: { phone: cleanPhone } });
      if (phoneTaken && phoneTaken.id !== id) throw conflictError("An admin with this phone number already exists.");
    }
    data.phone = cleanPhone;
  }

  const updated = await prisma.adminUser.update({ where: { id }, data, include: adminInclude });
  return stripPasswordHash(updated);
}

module.exports = { createAdminUser, listAdminUsers, getAdminUserById, updateAdminUser };