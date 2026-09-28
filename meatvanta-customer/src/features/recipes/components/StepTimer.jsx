import { useEffect, useRef, useState } from "react";

/**
 * "Start 8 min timer" on a step. Counts down in the page; when it ends the
 * phone vibrates (where supported) and a short beep plays.
 */
export default function StepTimer({ minutes, label }) {
  const [endsAt, setEndsAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(false);
  const firedRef = useRef(false);
  // Created on the Start tap: browsers only allow sound from a user gesture.
  const audioRef = useRef(null);

  useEffect(() => {
    if (!endsAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);

  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : minutes * 60;

  useEffect(() => {
    if (!endsAt || left > 0 || firedRef.current) return;
    firedRef.current = true;
    setDone(true);
    setEndsAt(null);
    try {
      navigator.vibrate?.([300, 150, 300]);
      const ctx = audioRef.current;
      if (ctx) {
        [0, 0.35, 0.7].forEach((at) => {
          const osc = ctx.createOscillator();
          osc.frequency.value = 880;
          osc.connect(ctx.destination);
          osc.start(ctx.currentTime + at);
          osc.stop(ctx.currentTime + at + 0.2);
        });
      }
    } catch {
      /* sound/vibration are extras */
    }
  }, [left, endsAt]);

  function start() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !audioRef.current) audioRef.current = new Ctx();
      audioRef.current?.resume?.();
    } catch {
      /* no sound on this device */
    }
    firedRef.current = false;
    setDone(false);
    setNow(Date.now());
    setEndsAt(Date.now() + minutes * 60 * 1000);
  }

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  if (endsAt) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono font-bold text-brand tabular-nums" role="timer" aria-live="off" aria-label={`${label} timer`}>
          {mm}:{ss}
        </span>
        <button type="button" onClick={() => setEndsAt(null)} className="text-xs font-semibold text-ink/60 underline">
          Stop
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={start}
        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border border-brand text-brand hover:bg-brand/5"
      >
        <span className="material-symbols-outlined text-sm">timer</span>
        {done ? "Again" : `Start ${minutes} min timer`}
      </button>
      {done && (
        <span className="text-xs font-bold text-success" role="status">
          Time's up!
        </span>
      )}
    </span>
  );
}
