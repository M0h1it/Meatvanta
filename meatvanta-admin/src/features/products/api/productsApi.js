import apiClient from "../../../lib/apiClient";

export async function fetchProducts({ categoryId, includeInactive = true, search } = {}) {
  const { data } = await apiClient.get("/products", {
    params: { categoryId, includeInactive, search },
  });
  return data.data.products;
}

export async function fetchProduct(id) {
  const { data } = await apiClient.get(`/products/${id}`);
  return data.data.product;
}

export async function createProduct(payload) {
  const { data } = await apiClient.post("/products", payload);
  return data.data.product;
}

export async function updateProduct(id, payload) {
  const { data } = await apiClient.put(`/products/${id}`, payload);
  return data.data.product;
}

export async function deleteProduct(id) {
  const { data } = await apiClient.delete(`/products/${id}`);
  return data.data;
}

export async function addVariant(productId, payload) {
  const { data } = await apiClient.post(`/products/${productId}/variants`, payload);
  return data.data.variant;
}

export async function updateVariant(variantId, payload) {
  const { data } = await apiClient.put(`/products/variants/${variantId}`, payload);
  return data.data.variant;
}

export async function deleteVariant(variantId) {
  const { data } = await apiClient.delete(`/products/variants/${variantId}`);
  return data.data;
}

export async function toggleVariantStock(variantId, isInStock) {
  const { data } = await apiClient.patch(`/products/variants/${variantId}/stock`, { isInStock });
  return data.data.variant;
}

// ---------- Image gallery ----------
// The first image (lowest sortOrder) is the cover shown in the shop.

/** Uploads one or more images; they are appended to the end of the gallery. */
export async function uploadProductImages(productId, files, onProgress) {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("images", file));
  const { data } = await apiClient.post(`/products/${productId}/images`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return data.data.product;
}

/** imageIds = every image id of the product, in the new order. */
export async function reorderProductImages(productId, imageIds) {
  const { data } = await apiClient.put(`/products/${productId}/images/order`, { imageIds });
  return data.data.product;
}

export async function deleteProductImage(imageId) {
  const { data } = await apiClient.delete(`/products/images/${imageId}`);
  return data.data.product;
}

export async function toggleProductStock(id, isInStock) {
  const { data } = await apiClient.patch(`/products/${id}/stock`, { isInStock });
  return data.data.product;
}

// ---------- Option groups & options ----------

export async function addOptionGroup(productId, payload) {
  const { data } = await apiClient.post(`/products/${productId}/option-groups`, payload);
  return data.data.group;
}

export async function updateOptionGroup(groupId, payload) {
  const { data } = await apiClient.put(`/products/option-groups/${groupId}`, payload);
  return data.data.group;
}

export async function deleteOptionGroup(groupId) {
  const { data } = await apiClient.delete(`/products/option-groups/${groupId}`);
  return data.data;
}

export async function addOption(groupId, payload) {
  const { data } = await apiClient.post(`/products/option-groups/${groupId}/options`, payload);
  return data.data.option;
}

export async function updateOption(optionId, payload) {
  const { data } = await apiClient.put(`/products/options/${optionId}`, payload);
  return data.data.option;
}

export async function deleteOption(optionId) {
  const { data } = await apiClient.delete(`/products/options/${optionId}`);
  return data.data;
}

// ---------- Tags (labels on product cards) ----------

export async function addProductTag(productId, payload) {
  const { data } = await apiClient.post(`/products/${productId}/tags`, payload);
  return data.data.tag;
}

export async function updateProductTag(tagId, payload) {
  const { data } = await apiClient.put(`/products/tags/${tagId}`, payload);
  return data.data.tag;
}

export async function deleteProductTag(tagId) {
  const { data } = await apiClient.delete(`/products/tags/${tagId}`);
  return data.data;
}

// ---------- Automatic "Bestseller" label ----------

/** { settings: { enabled, count, days, label, minUnits }, productIds } */
export async function fetchBestsellerSettings() {
  const { data } = await apiClient.get("/products/settings/bestseller");
  return data.data;
}

export async function updateBestsellerSettings(payload) {
  const { data } = await apiClient.put("/products/settings/bestseller", payload);
  return data.data;
}

// ---------- Combos ----------

/** { name, categoryId, description, price, mrp, label, items: [{ variantId, quantity }] } */
export async function createCombo(payload) {
  const { data } = await apiClient.post("/products/combos", payload);
  return data.data.product;
}

/** Replaces what's inside. An empty list turns it back into a normal product. */
export async function setComboItems(productId, items) {
  const { data } = await apiClient.put(`/products/${productId}/combo-items`, { items });
  return data.data;
}
