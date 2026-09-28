import apiClient from "../../../lib/apiClient";

/**
 * Live banners grouped by placement ({ home_top: [...], announcement: [...] })
 * plus each spot's shape ({ home_top: { desktopRatio, mobileRatio, fullWidth } }).
 */
export async function fetchLiveBanners() {
  const { data } = await apiClient.get("/banners");
  return { banners: data.data.banners || {}, layouts: data.data.layouts || {} };
}
