// Turns the admin's shape settings into CSS.

/** "3:1" -> "3 / 1"; "auto" -> null (use the picture's own shape). */
export function ratioToCss(ratio) {
  if (!ratio || ratio === "auto") return null;
  const [w, h] = ratio.split(":").map(Number);
  return w > 0 && h > 0 ? `${w} / ${h}` : null;
}

const FOCUS = {
  center: "center center",
  top: "center top",
  bottom: "center bottom",
  left: "left center",
  right: "right center",
};

/** Which part of a trimmed picture stays in view. */
export function focusToObjectPosition(focus) {
  return FOCUS[focus] || FOCUS.center;
}
