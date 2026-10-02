/**
 * Short two-tone chime generated with the Web Audio API - no audio file to
 * host or load.
 *
 * Browsers refuse to play audio until the user has interacted with the page,
 * so installAudioUnlock() listens for the first interaction of any kind and
 * primes the context then. It's installed at app startup (main.jsx) rather
 * than inside a component, so it's already listening on the login screen -
 * the click that submits the login form is what unlocks it.
 */
let audioContext = null;

function createContext() {
  if (audioContext) return audioContext;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
    return audioContext;
  } catch {
    return null; // audio simply won't play - never break the app over it
  }
}

export function unlockAudio() {
  const ctx = createContext();
  if (ctx && ctx.state === "suspended") ctx.resume();
}

/** Call once at app startup. Unlocks on the first click, tap, or keypress. */
export function installAudioUnlock() {
  const events = ["click", "touchstart", "keydown"];

  function handleFirstInteraction() {
    unlockAudio();
    events.forEach((e) => window.removeEventListener(e, handleFirstInteraction));
  }

  events.forEach((e) => window.addEventListener(e, handleFirstInteraction, { once: false }));
}

export function isAudioReady() {
  return !!audioContext && audioContext.state === "running";
}

/**
 * One loud, long "new order" ring (about 4 seconds): four bell-like ding-dongs,
 * each a fundamental plus a brighter overtone so it cuts through shop noise,
 * run through a compressor so it is loud without distorting. It plays ONCE per
 * call - repeating is not this file's job.
 */
function playBell(ctx, out, startTime, frequency, duration, peak) {
  // Fundamental + a 2.76x partial (that is what makes it sound like a bell).
  [
    { mult: 1, type: "triangle", level: 1 },
    { mult: 2.76, type: "sine", level: 0.45 },
  ].forEach(({ mult, type, level }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency * mult;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peak * level, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(out);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.05);
  });
}

function scheduleRing(ctx) {
  const master = ctx.createGain();
  master.gain.value = 1;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 12;
  compressor.ratio.value = 6;
  master.connect(compressor);
  compressor.connect(ctx.destination);

  const start = ctx.currentTime + 0.05;
  const ROUNDS = 4;
  const ROUND_LENGTH = 0.95;
  for (let i = 0; i < ROUNDS; i += 1) {
    const t = start + i * ROUND_LENGTH;
    playBell(ctx, master, t, 880, 0.7, 0.55); // A5
    playBell(ctx, master, t + 0.28, 1318.51, 0.8, 0.6); // E6
  }
}

/** True when the browser let it play; false when audio is still locked. */
export function playNotificationSound() {
  const ctx = createContext();
  if (!ctx) return false;

  // Browsers keep audio locked until the page has had a click/tap/keypress.
  // Never queue the ring behind resume() - it would fire late, at a random
  // moment, instead of when the order came in. Ask for resume and report back;
  // the popup then shows a "tap to enable sound" strip.
  if (ctx.state !== "running") {
    ctx.resume().catch(() => {});
    return false;
  }
  try {
    scheduleRing(ctx);
    return true;
  } catch {
    return false; // a missed sound should never surface as an error
  }
}

/**
 * For a click on "Replay" / "Sound off - tap to enable": the click is the user
 * gesture the browser wanted, so wait for the context to wake up, then ring.
 */
export async function unlockAndPlayNotificationSound() {
  const ctx = createContext();
  if (!ctx) return false;
  try {
    if (ctx.state !== "running") await ctx.resume();
    if (ctx.state !== "running") return false;
    scheduleRing(ctx);
    return true;
  } catch {
    return false;
  }
}
