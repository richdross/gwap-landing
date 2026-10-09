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
