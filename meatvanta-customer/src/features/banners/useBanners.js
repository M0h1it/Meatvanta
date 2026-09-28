import { useEffect, useState } from "react";
import { fetchLiveBanners } from "./api/bannersApi";

// One request per page load, shared by every banner spot on the page.
// A failed request just means no banners - never a broken page.
let cache = null;
let inflight = null;
const EMPTY = { banners: {}, layouts: {} };
const DEFAULT_LAYOUT = { desktopRatio: "auto", mobileRatio: "auto", fullWidth: false };

function loadOnce() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetchLiveBanners()
      .then((data) => (cache = data))
      .catch(() => (cache = EMPTY))
      .finally(() => (inflight = null));
  }
  return inflight;
}

function useBannerData(select, placement) {
  const [value, setValue] = useState(() => select(cache || EMPTY, placement));
  useEffect(() => {
    let active = true;
    loadOnce().then((data) => {
      if (active) setValue(select(data, placement));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement]);
  return value;
}

const selectBanners = (data, placement) => data.banners[placement] || [];
const selectLayout = (data, placement) => data.layouts[placement] || DEFAULT_LAYOUT;

/** Live banners for one placement ([] while loading or when there are none). */
export function useBanners(placement) {
  return useBannerData(selectBanners, placement);
}

/** The admin-chosen shape for one placement. */
export function useBannerLayout(placement) {
  return useBannerData(selectLayout, placement);
}
