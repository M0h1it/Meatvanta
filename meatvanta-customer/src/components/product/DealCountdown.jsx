import { useEffect, useState } from "react";

function remaining(endsAt) {
  return Math.max(0, new Date(endsAt).getTime() - Date.now());
}

function format(ms) {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** "Ends in 03:12:45" - ticks every second, disappears when the deal is over. */
export default function DealCountdown({ endsAt, className = "" }) {
  const [ms, setMs] = useState(() => remaining(endsAt));

  useEffect(() => {
    setMs(remaining(endsAt));
    const timer = setInterval(() => setMs(remaining(endsAt)), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (!endsAt || ms <= 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`} role="timer" aria-live="off">
      <span className="material-symbols-outlined text-[1.1em] leading-none" aria-hidden="true">
        timer
      </span>
      Ends in {format(ms)}
    </span>
  );
}
