/**
 * Format decimal hours as human-readable "Xh Ym" string.
 * Examples: 1.5 → "1h 30m", 0.25 → "15m", 2 → "2h", 0 → "0m"
 */
export function formatHours(h: number | null | undefined): string {
  if (h == null || h === 0) return "0m";
  const totalMins = Math.round(h * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}
