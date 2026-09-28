import apiClient from "../../../lib/apiClient";

/** { banners, layouts: { home_top: { desktopRatio, mobileRatio, fullWidth } }, options } */
export async function fetchBanners() {
  const { data } = await apiClient.get("/banners");
  return data.data;
}

/** Shape of one banner spot: desktopRatio / mobileRatio ("auto", "3:1", ...) and fullWidth. */
export async function updateBannerLayout(placement, layout) {
  const { data } = await apiClient.put(`/banners/layouts/${placement}`, layout);
  return data.data.layout;
}

/** formData: fields + files "desktop" / "mobile" / "poster". */
export async function createBanner(formData, onProgress) {
  const { data } = await apiClient.post("/banners", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded / e.total) * 100)),
  });
  return data.data.banner;
}

export async function updateBanner(id, formData, onProgress) {
  const { data } = await apiClient.put(`/banners/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded / e.total) * 100)),
  });
  return data.data.banner;
}

/** Quick switch on/off from the list, without re-sending files. */
export async function setBannerActive(id, isActive) {
  const formData = new FormData();
  formData.append("isActive", String(isActive));
  return updateBanner(id, formData);
}

export async function deleteBanner(id) {
  const { data } = await apiClient.delete(`/banners/${id}`);
  return data.data;
}

export async function reorderBanners(placement, ids) {
  const { data } = await apiClient.put("/banners/order", { placement, ids });
  return data.data.banners;
}
