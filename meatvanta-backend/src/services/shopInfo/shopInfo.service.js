const prisma = require("../../config/db");

const SHOP_INFO_ID = 1; // singleton

const DEFAULTS = {
  id: SHOP_INFO_ID,
  shopName: "Meat Vanta",
  tagline: "Fresh Every Morning",
  yearsInBusiness: 35,
  phone: "",
  whatsappNumber: "",
  email: "",
  addressLine: "",
  mapUrl: "",
  shopHours: "",
  aboutStory: "",
  qualityPromise: "",
  fssaiNumber: "",
  instagramUrl: "",
  facebookUrl: "",
  youtubeUrl: "",
};

/** Reads the singleton, creating it on first access so the admin page is never empty. */
async function getShopInfo() {
  const existing = await prisma.shopInfo.findUnique({ where: { id: SHOP_INFO_ID } });
  if (existing) return existing;
  return prisma.shopInfo.create({ data: DEFAULTS });
}

async function updateShopInfo(changes) {
  await getShopInfo(); // guarantees the row exists

  const fields = [
    "shopName",
    "tagline",
    "phone",
    "whatsappNumber",
    "email",
    "addressLine",
    "mapUrl",
    "shopHours",
    "aboutStory",
    "qualityPromise",
    "fssaiNumber",
    "instagramUrl",
    "facebookUrl",
    "youtubeUrl",
  ];

  const data = {};
  for (const field of fields) {
    if (changes[field] !== undefined) data[field] = String(changes[field]).trim();
  }
  if (changes.yearsInBusiness !== undefined) {
    data.yearsInBusiness = Number(changes.yearsInBusiness);
  }

  return prisma.shopInfo.update({ where: { id: SHOP_INFO_ID }, data });
}

module.exports = { getShopInfo, updateShopInfo, DEFAULTS };
