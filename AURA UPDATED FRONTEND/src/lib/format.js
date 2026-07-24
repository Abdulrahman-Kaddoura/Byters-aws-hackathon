import { AVATAR_COLORS } from "../styles.js";

export function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function avatarStyle(seed) {
  const idx = typeof seed === "number" ? seed : hashString(String(seed || "")) % AVATAR_COLORS.length;
  const c = AVATAR_COLORS[((idx % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length];
  return { background: `linear-gradient(135deg, ${c}, ${c}CC)` };
}

export function relativeTime(iso) {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
