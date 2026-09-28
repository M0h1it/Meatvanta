import { useEffect, useState } from "react";

/**
 * true while the CSS media query matches, e.g. useMediaQuery("(min-width: 640px)").
 * Used where a desktop and a phone version of a picture both exist: a hidden
 * <img> still downloads, so only the one that is showing gets a src.
 */
export function useMediaQuery(query) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}
