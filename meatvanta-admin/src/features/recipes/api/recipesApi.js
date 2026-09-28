import apiClient from "../../../lib/apiClient";

export async function fetchRecipes() {
  const { data } = await apiClient.get("/recipes");
  return data.data.recipes;
}

export async function fetchRecipe(id) {
  const { data } = await apiClient.get(`/recipes/${id}`);
  return data.data.recipe;
}

export async function createRecipe(title) {
  const { data } = await apiClient.post("/recipes", { title });
  return data.data.recipe;
}

/** Saves everything: details, images [{ path }], ingredients and steps. */
export async function saveRecipe(id, payload) {
  const { data } = await apiClient.put(`/recipes/${id}`, payload);
  return data.data.recipe;
}

export async function setRecipePublished(id, isPublished) {
  const { data } = await apiClient.patch(`/recipes/${id}/publish`, { isPublished });
  return data.data.recipe;
}

export async function deleteRecipe(id) {
  const { data } = await apiClient.delete(`/recipes/${id}`);
  return data.data;
}

/** Uploads photos; returns [{ path, url }] to put into the recipe before saving. */
export async function uploadRecipeImages(id, files, onProgress) {
  const formData = new FormData();
  Array.from(files).forEach((f) => formData.append("images", f));
  const { data } = await apiClient.post(`/recipes/${id}/images`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded / e.total) * 100)),
  });
  return data.data.images;
}
