const recipesService = require("../../services/recipes/recipes.service");
const { success, failure } = require("../../utils/apiResponse.util");
const { writeAuditLog } = require("../../utils/auditLogger.util");

function handleServiceError(err, next, res) {
  if (err.expose) return failure(res, err.statusCode, err.message);
  return next(err);
}

function audit(req, action, entityId, metadata) {
  return writeAuditLog({ adminId: req.admin.id, action, entity: "Recipe", entityId, metadata, ipAddress: req.ip });
}

// ---------- admin ----------

async function list(req, res, next) {
  try {
    const recipes = await recipesService.listRecipes();
    return success(res, 200, "Recipes fetched.", { recipes });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const recipe = await recipesService.getRecipe(Number(req.params.id));
    return success(res, 200, "Recipe fetched.", { recipe });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function create(req, res, next) {
  try {
    const recipe = await recipesService.createRecipe(req.body || {});
    await audit(req, "recipes:create", recipe.id, { title: recipe.title });
    return success(res, 201, "Recipe created.", { recipe });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function save(req, res, next) {
  try {
    const id = Number(req.params.id);
    const recipe = await recipesService.saveRecipe(id, req.body || {});
    await audit(req, "recipes:update", id, {
      title: recipe.title,
      isPublished: recipe.isPublished,
      ingredients: recipe.ingredients.length,
      steps: recipe.steps.length,
    });
    return success(res, 200, "Recipe saved.", { recipe });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function setPublished(req, res, next) {
  try {
    const id = Number(req.params.id);
    const isPublished = Boolean((req.body || {}).isPublished);
    const recipe = await recipesService.setPublished(id, isPublished);
    await audit(req, "recipes:update", id, { isPublished });
    return success(res, 200, isPublished ? "Recipe published." : "Recipe hidden.", { recipe });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    const recipe = await recipesService.deleteRecipe(id);
    await audit(req, "recipes:delete", id, { title: recipe.title });
    return success(res, 200, "Recipe deleted.", { id });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function uploadImages(req, res, next) {
  try {
    const images = await recipesService.uploadImages(Number(req.params.id), req.files);
    return success(res, 201, images.length === 1 ? "Photo uploaded." : `${images.length} photos uploaded.`, { images });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

// ---------- customer site ----------

async function listPublished(req, res, next) {
  try {
    const recipes = await recipesService.listPublished();
    return success(res, 200, "Recipes fetched.", { recipes });
  } catch (err) {
    return next(err);
  }
}

async function getPublished(req, res, next) {
  try {
    const recipe = await recipesService.getPublishedBySlug(req.params.slug);
    return success(res, 200, "Recipe fetched.", { recipe });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

module.exports = { list, getOne, create, save, setPublished, remove, uploadImages, listPublished, getPublished };
