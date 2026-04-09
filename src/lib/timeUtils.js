/**
 * Parse a time string into total minutes since midnight.
 * Handles both 24h ("14:30") and 12h ("2:30 PM") formats.
 */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const s = timeStr.trim().toUpperCase();
  const isPM = s.includes("PM");
  const isAM = s.includes("AM");
  const clean = s.replace(/[^0-9:]/g, "");
  const [hStr = "0", mStr = "0"] = clean.split(":");
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * Format a time range label for an hourly bucket.
 * e.g. 540 → "9:00 AM – 10:00 AM"
 */
export function formatHourBucket(startMinutes) {
  const h = Math.floor(startMinutes / 60);
  const fmt = (hr) => `${hr % 12 || 12}:00 ${hr < 12 ? "AM" : "PM"}`;
  return `${fmt(h)} – ${fmt(h + 1)}`;
}
