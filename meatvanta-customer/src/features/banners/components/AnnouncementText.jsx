import { useEffect, useState } from "react";
import BannerLink from "./BannerLink";
import { useMediaQuery, REDUCED_MOTION_QUERY } from "../useMediaQuery";

const ROTATE_MS = 4500;

/** Text of the top strip. Several announcements take turns; none = renders nothing. */
export default function AnnouncementText({ announcements, className = "" }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const count = announcements.length;

  useEffect(() => {
    if (count < 2 || reduceMotion) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, reduceMotion]);

  if (count === 0) return null;
  const current = announcements[index % count];

  return (
    <div className={`min-w-0 ${className}`} aria-live="polite">
      <BannerLink banner={current} className="flex items-center gap-1.5 min-w-0 hover:underline">
        <span className="material-symbols-outlined text-sm shrink-0">campaign</span>
        <span key={current.id} className="truncate animate-[fadeIn_400ms_ease-out]">
          {current.text}
        </span>
      </BannerLink>
    </div>
  );
}
