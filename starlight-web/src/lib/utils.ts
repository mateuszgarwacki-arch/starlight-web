import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Days remaining until an event, with colour tier */
export function daysRemaining(eventDate: string | null): {
  days: number | null;
  tier: "green" | "amber" | "red" | "past";
} {
  if (!eventDate) return { days: null, tier: "green" };
  const diff = Math.ceil(
    (new Date(eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return { days: diff, tier: "past" };
  if (diff <= 7) return { days: diff, tier: "red" };
  if (diff <= 14) return { days: diff, tier: "amber" };
  return { days: diff, tier: "green" };
}

/** Format currency as £X,XXX.XX */
export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

/** Format date as DD MMM YYYY */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** WO status to badge class */
export function statusClass(status: string | null): string {
  switch (status) {
    case "Not-Started": return "badge-not-started";
    case "Ready": return "badge-ready";
    case "In-Progress": return "badge-in-progress";
    case "Complete": return "badge-complete";
    case "On-Hold": return "badge-on-hold";
    case "Voided": return "badge-voided";
    default: return "badge-not-started";
  }
}
