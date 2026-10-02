import apiClient from "../../../lib/apiClient";

export async function fetchCategories(includeInactive = false) {
  const { data } = await apiClient.get("/categories", { params: { includeInactive } });
  return data.data.categories;
}

export async function createCategory(payload) {
  const { data } = await apiClient.post("/categories", payload);
  return data.data.category;
}

export async function updateCategory(id, payload) {
  const { data } = await apiClient.put(`/categories/${id}`, payload);
  return data.data.category;
}

export async function deleteCategory(id) {
  const { data } = await apiClient.delete(`/categories/${id}`);
  return data.data;
}

/** slot: "desktop" (main photo) or "mobile" (optional phone version). */
export async function uploadCategoryImage(id, slot, file) {
  const formData = new FormData();
  formData.append("slot", slot);
  formData.append("image", file);
  const { data } = await apiClient.post(`/categories/${id}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.data.category;
}

export async function removeCategoryImage(id, slot) {
  const { data } = await apiClient.delete(`/categories/${id}/image`, { params: { slot } });
  return data.data.category;
}
