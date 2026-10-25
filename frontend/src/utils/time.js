// Time helpers for delegations and temporary grants

/** Durations offered in the UI, in seconds. Short ones make the expiry easy to demo. */
export const DURATIONS = [
  { label: "10 minutes", seconds: 10 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
  { label: "1 day", seconds: 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { label: "30 days", seconds: 30 * 24 * 60 * 60 },
];

/** Unix seconds `seconds` from now, for a contract expiry argument. */
export function expiryFromNow(seconds) {
  return Math.floor(Date.now() / 1000) + seconds;
}

/** "Oct 31, 4:05 PM" for an ISO date or unix seconds. */
export function formatDate(value) {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "in 6 days (Oct 31, 4:05 PM)" for an ISO date or unix seconds; "no expiry" for null. */
export function formatExpiry(value) {
  if (value === null || value === undefined) return "no expiry";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ["day", 864e5],
    ["hour", 36e5],
    ["minute", 6e4],
  ];
  const [unit, ms] = units.find(([, ms]) => abs >= ms) || ["minute", 6e4];
  const n = Math.max(1, Math.round(abs / ms));
  const rel = `${n} ${unit}${n === 1 ? "" : "s"}`;
  const when = formatDate(date.toISOString());
  return diff >= 0 ? `in ${rel} (${when})` : `${rel} ago (${when})`;
}
