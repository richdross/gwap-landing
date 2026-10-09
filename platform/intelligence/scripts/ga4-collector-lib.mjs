import { createHash } from "node:crypto";

export function signalKey(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

export function hourBucket(date = new Date()) {
  return new Date(date).toISOString().slice(0, 13).replace("T", "-");
}

export function isEditorialArticlePath(value) {
  return /^\/(blog|brief)\/[^/]+\/?$/.test(String(value || ""));
}

// GA4 metrics are rolling seven-day values; limit write amplification to four snapshots per day.
export function sixHourBucket(date = new Date()) {
  const now = new Date(date);
  const roundedHour = Math.floor(now.getUTCHours() / 6) * 6;
  return now.toISOString().slice(0, 10) + "-" + String(roundedHour).padStart(2, "0");
}
