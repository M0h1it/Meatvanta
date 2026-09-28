const express = require("express");
const router = express.Router();

const bannersController = require("../../controllers/banners/banners.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { uploadBannerMedia } = require("../../middlewares/upload.middleware");

router.get("/", requireAuth, requirePermission("banners:view"), bannersController.list);
// Before "/:id" so "order" is never read as an id.
router.put("/order", requireAuth, requirePermission("banners:update"), bannersController.reorder);
router.put("/layouts/:placement", requireAuth, requirePermission("banners:update"), bannersController.updateLayout);
router.get("/:id", requireAuth, requirePermission("banners:view"), bannersController.getOne);
// multipart/form-data: fields + files "desktop", "mobile", "poster"
router.post("/", requireAuth, requirePermission("banners:create"), uploadBannerMedia, bannersController.create);
router.put("/:id", requireAuth, requirePermission("banners:update"), uploadBannerMedia, bannersController.update);
router.delete("/:id", requireAuth, requirePermission("banners:delete"), bannersController.remove);

module.exports = router;
