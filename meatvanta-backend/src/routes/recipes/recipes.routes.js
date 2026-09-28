const express = require("express");
const router = express.Router();

const recipesController = require("../../controllers/recipes/recipes.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { uploadProductImages } = require("../../middlewares/upload.middleware");

router.get("/", requireAuth, requirePermission("recipes:view"), recipesController.list);
router.post("/", requireAuth, requirePermission("recipes:create"), recipesController.create);
router.get("/:id", requireAuth, requirePermission("recipes:view"), recipesController.getOne);
// Saves the whole recipe: details, photos, ingredients and steps.
router.put("/:id", requireAuth, requirePermission("recipes:update"), recipesController.save);
router.patch("/:id/publish", requireAuth, requirePermission("recipes:update"), recipesController.setPublished);
router.delete("/:id", requireAuth, requirePermission("recipes:delete"), recipesController.remove);
// multipart/form-data, field "images" - returns [{ path, url }] to put in the recipe before saving.
router.post("/:id/images", requireAuth, requirePermission("recipes:update"), uploadProductImages, recipesController.uploadImages);

module.exports = router;
