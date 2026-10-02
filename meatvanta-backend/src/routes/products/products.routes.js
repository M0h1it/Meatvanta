const express = require("express");
const router = express.Router();

const productsController = require("../../controllers/products/products.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { uploadProductImages } = require("../../middlewares/upload.middleware");

// Products
router.post("/", requireAuth, requirePermission("products:create"), productsController.create);
// Combos: create in one step, or change a product's contents.
router.post("/combos", requireAuth, requirePermission("products:create"), productsController.createCombo);
router.put("/:id/combo-items", requireAuth, requirePermission("products:update"), productsController.setComboItems);
router.get("/", requireAuth, requirePermission("products:view"), productsController.list);
router.get("/counts/status", requireAuth, requirePermission("products:view"), productsController.counts);
router.get("/:id", requireAuth, requirePermission("products:view"), productsController.getOne);
router.put("/:id", requireAuth, requirePermission("products:update"), productsController.update);
router.delete("/:id", requireAuth, requirePermission("products:delete"), productsController.remove);
// Permanent delete - only for an already-deactivated product (checked in the service).
router.delete("/:id/permanent", requireAuth, requirePermission("products:delete"), productsController.removePermanently);

// Product image gallery. The first image (lowest sortOrder) is the cover.
router.post(
  "/:id/images",
  requireAuth,
  requirePermission("products:update"),
  uploadProductImages,
  productsController.uploadImages
);
router.put(
  "/:id/images/order",
  requireAuth,
  requirePermission("products:update"),
  productsController.reorderImages
);
router.delete(
  "/images/:imageId",
  requireAuth,
  requirePermission("products:update"),
  productsController.deleteImage
);

// Tags shown on product cards ("Eid Special", deals with a countdown).
router.post("/:id/tags", requireAuth, requirePermission("products:update"), productsController.addTag);
router.put("/tags/:tagId", requireAuth, requirePermission("products:update"), productsController.updateTag);
router.delete("/tags/:tagId", requireAuth, requirePermission("products:update"), productsController.deleteTag);

// Automatic "Bestseller" label - on/off, how many products, how many days back.
router.get("/settings/bestseller", requireAuth, requirePermission("products:view"), productsController.getBestsellerSettings);
router.put("/settings/bestseller", requireAuth, requirePermission("products:update"), productsController.updateBestsellerSettings);

// Product-level availability - hides the whole item from the shop for a day.
router.patch(
  "/:id/stock",
  requireAuth,
  requirePermission("products:toggleStock"),
  productsController.toggleStock
);

// Option groups (e.g. "Marination Style") and their options (Tandoori +Rs.39).
// Nested for creation, flat for edit/delete - same shape as variants.
router.post(
  "/:id/option-groups",
  requireAuth,
  requirePermission("products:update"),
  productsController.addOptionGroup
);
router.put(
  "/option-groups/:groupId",
  requireAuth,
  requirePermission("products:update"),
  productsController.updateOptionGroup
);
router.delete(
  "/option-groups/:groupId",
  requireAuth,
  requirePermission("products:delete"),
  productsController.deleteOptionGroup
);
router.post(
  "/option-groups/:groupId/options",
  requireAuth,
  requirePermission("products:update"),
  productsController.addOption
);
router.put(
  "/options/:optionId",
  requireAuth,
  requirePermission("products:update"),
  productsController.updateOption
);
router.delete(
  "/options/:optionId",
  requireAuth,
  requirePermission("products:delete"),
  productsController.deleteOption
);

// Variants (nested under a product for creation, flat for update/delete/stock)
router.post(
  "/:productId/variants",
  requireAuth,
  requirePermission("products:update"),
  productsController.addVariant
);
router.put(
  "/variants/:variantId",
  requireAuth,
  requirePermission("products:update"),
  productsController.updateVariant
);
router.delete(
  "/variants/:variantId",
  requireAuth,
  requirePermission("products:delete"),
  productsController.deleteVariant
);
router.patch(
  "/variants/:variantId/stock",
  requireAuth,
  requirePermission("products:toggleStock"),
  productsController.toggleVariantStock
);

module.exports = router;
