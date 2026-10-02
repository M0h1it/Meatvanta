const express = require("express");
const router = express.Router();

const categoriesController = require("../../controllers/categories/categories.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { uploadCategoryImage } = require("../../middlewares/upload.middleware");

router.post("/", requireAuth, requirePermission("categories:create"), categoriesController.create);
router.get("/", requireAuth, requirePermission("categories:view"), categoriesController.list);
router.get("/:id", requireAuth, requirePermission("categories:view"), categoriesController.getOne);
router.put("/:id", requireAuth, requirePermission("categories:update"), categoriesController.update);
// Card photo for the home page: field "image" + body field "slot" (desktop | mobile).
router.post("/:id/image", requireAuth, requirePermission("categories:update"), uploadCategoryImage, categoriesController.uploadImage);
router.delete("/:id/image", requireAuth, requirePermission("categories:update"), categoriesController.removeImage);
router.delete("/:id", requireAuth, requirePermission("categories:delete"), categoriesController.remove);

module.exports = router;
